import { Response } from 'express';
import { prisma } from '../utils/db';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware';

const transactionSchema = z.object({
  walletId: z.string().uuid(),
  categoryId: z.string().uuid(),
  amount: z.number().positive(),
  type: z.enum(['INCOME', 'EXPENSE']),
  date: z.string().datetime().optional(), // ISO string
  description: z.string().optional(),
});

export const getTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const { walletId } = req.query;
    
    // Ensure the wallet belongs to the user if walletId is provided
    if (walletId) {
       const wallet = await prisma.wallet.findUnique({ where: { id: String(walletId) } });
       if (!wallet || wallet.userId !== req.userId) {
          res.status(403).json({ error: 'Access denied to this wallet' });
          return;
       }
    }

    const transactions = await prisma.transaction.findMany({
      where: walletId 
        ? { walletId: String(walletId) }
        : { wallet: { userId: req.userId } },
      include: {
        category: true,
        wallet: true,
      },
      orderBy: { date: 'desc' },
    });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

export const createTransaction = async (req: AuthRequest, res: Response) => {
  try {
    const data = transactionSchema.parse(req.body);
    
    // Verify wallet ownership
    const wallet = await prisma.wallet.findUnique({ where: { id: data.walletId } });
    if (!wallet || wallet.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied to this wallet' });
      return;
    }

    // Use Prisma transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx: any) => {
      const transaction = await tx.transaction.create({
        data: {
          ...data,
          date: data.date ? new Date(data.date) : undefined,
        },
      });

      const balanceChange = data.type === 'INCOME' ? data.amount : -data.amount;
      
      await tx.wallet.update({
        where: { id: data.walletId },
        data: { balance: { increment: balanceChange } },
      });

      return transaction;
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      res.status(500).json({ error: 'Failed to create transaction' });
    }
  }
};

export const deleteTransaction = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: { wallet: true },
    });

    if (!transaction || (transaction as any).wallet.userId !== req.userId) {
      res.status(404).json({ error: 'Transaction not found or access denied' });
      return;
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.transaction.delete({ where: { id } });

      const balanceRevert = transaction.type === 'INCOME' ? -transaction.amount : transaction.amount;
      
      await tx.wallet.update({
        where: { id: transaction.walletId },
        data: { balance: { increment: balanceRevert } },
      });
    });

    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
};

export const updateTransaction = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    console.log(`Updating transaction ${id} for user ${req.userId}`);
    const data = transactionSchema.parse(req.body);

    const oldTransaction = await prisma.transaction.findUnique({
      where: { id },
      include: { wallet: true },
    });

    if (!oldTransaction) {
      console.log(`Transaction ${id} not found`);
    } else if ((oldTransaction as any).wallet.userId !== req.userId) {
      console.log(`Access denied for transaction ${id}. Owner: ${(oldTransaction as any).wallet.userId}, Req: ${req.userId}`);
    }

    if (!oldTransaction || (oldTransaction as any).wallet.userId !== req.userId) {
      res.status(404).json({ error: 'Transaction not found or access denied' });
      return;
    }

    // Verify ownership of the new wallet
    const newWallet = await prisma.wallet.findUnique({ where: { id: data.walletId } });
    if (!newWallet || newWallet.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied to the new wallet' });
      return;
    }

    const result = await prisma.$transaction(async (tx: any) => {
      // 1. If it's a transfer, handle both sides
      console.log(`Checking if transaction is a transfer. TransferId: ${oldTransaction.transferId}`);
      if (oldTransaction.transferId) {
        const transfer = await tx.transfer.findUnique({
          where: { id: oldTransaction.transferId },
          include: { transactions: true },
        });

        if (transfer) {
          const otherTransaction = transfer.transactions.find((t: any) => t.id !== oldTransaction.id);
          console.log(`Transfer found. Other transaction ID: ${otherTransaction?.id}`);
          
          if (otherTransaction) {
            // Reverse old balances for both transactions
            const oldRevert = oldTransaction.type === 'INCOME' ? -oldTransaction.amount : oldTransaction.amount;
            await tx.wallet.update({
              where: { id: oldTransaction.walletId },
              data: { balance: { increment: oldRevert } },
            });

            const otherOldRevert = otherTransaction.type === 'INCOME' ? -otherTransaction.amount : otherTransaction.amount;
            await tx.wallet.update({
              where: { id: otherTransaction.walletId },
              data: { balance: { increment: otherOldRevert } },
            });

            // Calculate new values for both sides
            let newSourceAmount = transfer.sourceAmount;
            let newTargetAmount = transfer.targetAmount;

            if (oldTransaction.type === 'EXPENSE') {
              newSourceAmount = data.amount;
              newTargetAmount = data.amount * transfer.exchangeRate;
            } else {
              newTargetAmount = data.amount;
              newSourceAmount = data.amount / transfer.exchangeRate;
            }
            
            console.log(`Updating transfer amounts: Source=${newSourceAmount}, Target=${newTargetAmount}`);

            // Update Transfer record
            await tx.transfer.update({
              where: { id: transfer.id },
              data: {
                sourceAmount: newSourceAmount,
                targetAmount: newTargetAmount,
                description: data.description,
                date: data.date ? new Date(data.date) : undefined,
                sourceWalletId: oldTransaction.type === 'EXPENSE' ? data.walletId : undefined,
                targetWalletId: oldTransaction.type === 'INCOME' ? data.walletId : undefined,
              },
            });

            // Update both Transaction records
            const updated = await tx.transaction.update({
              where: { id },
              data: {
                ...data,
                date: data.date ? new Date(data.date) : undefined,
              },
            });

            await tx.transaction.update({
              where: { id: otherTransaction.id },
              data: {
                amount: oldTransaction.type === 'EXPENSE' ? newTargetAmount : newSourceAmount,
                description: data.description,
                date: data.date ? new Date(data.date) : undefined,
                categoryId: data.categoryId, // Sync category too
              },
            });

            // Apply new balances
            await tx.wallet.update({
              where: { id: data.walletId },
              data: { balance: { increment: data.type === 'INCOME' ? data.amount : -data.amount } },
            });

            const otherNewAmount = oldTransaction.type === 'EXPENSE' ? newTargetAmount : newSourceAmount;
            await tx.wallet.update({
              where: { id: otherTransaction.walletId },
              data: { balance: { increment: otherTransaction.type === 'INCOME' ? otherNewAmount : -otherNewAmount } },
            });

            console.log('Transfer atomic update completed');
            return updated;
          }
        }
      }

      // Regular transaction update logic (fallback for non-transfer transactions)
      // 1. Reverse old transaction effect
      const oldBalanceRevert = oldTransaction.type === 'INCOME' ? -oldTransaction.amount : oldTransaction.amount;
      await tx.wallet.update({
        where: { id: oldTransaction.walletId },
        data: { balance: { increment: oldBalanceRevert } },
      });

      // 2. Apply new transaction effect
      const newBalanceChange = data.type === 'INCOME' ? data.amount : -data.amount;
      await tx.wallet.update({
        where: { id: data.walletId },
        data: { balance: { increment: newBalanceChange } },
      });

      // 3. Update transaction record
      const updated = await tx.transaction.update({
        where: { id },
        data: {
          ...data,
          date: data.date ? new Date(data.date) : undefined,
        },
      });

      return updated;
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      res.status(500).json({ error: 'Failed to update transaction' });
    }
  }
};
