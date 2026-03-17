import { Response } from 'express';
import { prisma } from '../utils/db';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware';

const transferSchema = z.object({
  sourceWalletId: z.string().uuid(),
  targetWalletId: z.string().uuid(),
  sourceAmount: z.number().positive(),
  targetAmount: z.number().positive(),
  exchangeRate: z.number().positive().default(1),
  categoryId: z.string().uuid(), // Category for the transactions
  description: z.string().optional(),
  date: z.string().datetime().optional(),
});

export const createTransfer = async (req: AuthRequest, res: Response) => {
  try {
    const data = transferSchema.parse(req.body);

    if (data.sourceWalletId === data.targetWalletId) {
      res.status(400).json({ error: 'Source and target wallets must be different' });
      return;
    }

    // Verify ownership of both wallets
    const sourceWallet = await prisma.wallet.findUnique({ where: { id: data.sourceWalletId } });
    const targetWallet = await prisma.wallet.findUnique({ where: { id: data.targetWalletId } });

    if (!sourceWallet || sourceWallet.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied to source wallet' });
      return;
    }

    if (!targetWallet || targetWallet.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied to target wallet' });
      return;
    }

    // Atomic Transfer
    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Create Transfer record
      const transfer = await tx.transfer.create({
        data: {
          sourceWalletId: data.sourceWalletId,
          targetWalletId: data.targetWalletId,
          sourceAmount: data.sourceAmount,
          targetAmount: data.targetAmount,
          exchangeRate: data.exchangeRate,
          description: data.description,
          date: data.date ? new Date(data.date) : undefined,
        },
      });

      // 2. Create EXPENSE transaction for source wallet
      await tx.transaction.create({
        data: {
          walletId: data.sourceWalletId,
          categoryId: data.categoryId,
          transferId: transfer.id,
          amount: data.sourceAmount,
          type: 'EXPENSE',
          description: data.description || `Transfer to ${targetWallet.name}`,
          date: data.date ? new Date(data.date) : undefined,
        },
      });

      // 3. Create INCOME transaction for target wallet
      await tx.transaction.create({
        data: {
          walletId: data.targetWalletId,
          categoryId: data.categoryId,
          transferId: transfer.id,
          amount: data.targetAmount,
          type: 'INCOME',
          description: data.description || `Transfer from ${sourceWallet.name}`,
          date: data.date ? new Date(data.date) : undefined,
        },
      });

      // 4. Update source wallet balance
      await tx.wallet.update({
        where: { id: data.sourceWalletId },
        data: { balance: { decrement: data.sourceAmount } },
      });

      // 5. Update target wallet balance
      await tx.wallet.update({
        where: { id: data.targetWalletId },
        data: { balance: { increment: data.targetAmount } },
      });

      return transfer;
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      console.error('Transfer failed:', error);
      res.status(500).json({ error: 'Failed to create transfer' });
    }
  }
};

export const getTransfers = async (req: AuthRequest, res: Response) => {
  try {
    const transfers = await prisma.transfer.findMany({
      where: {
        OR: [
          { sourceWalletId: { in: (await prisma.wallet.findMany({ where: { userId: req.userId }, select: { id: true } })).map(w => w.id) } },
          { targetWalletId: { in: (await prisma.wallet.findMany({ where: { userId: req.userId }, select: { id: true } })).map(w => w.id) } }
        ]
      },
      orderBy: { date: 'desc' },
    });
    res.json(transfers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
};
