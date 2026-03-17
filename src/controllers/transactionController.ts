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
