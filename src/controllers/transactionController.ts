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
