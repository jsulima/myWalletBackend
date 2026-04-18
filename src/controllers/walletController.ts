import { Response } from 'express';
import { prisma } from '../utils/db';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware';
import { getUSDRatesMap } from '../services/currencyService';

const walletSchema = z.object({
  name: z.string().min(1),
  balance: z.number().optional(),
  currency: z.string().optional(),
  type: z.enum(['CASH', 'CARD']).optional(),
});

export const getWallets = async (req: AuthRequest, res: Response) => {
  try {
    const wallets = await prisma.wallet.findMany({
      where: { userId: req.userId },
      orderBy: [
        { order: 'asc' },
        { createdAt: 'desc' }
      ],
    });
    res.json(wallets);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch wallets' });
  }
};

export const createWallet = async (req: AuthRequest, res: Response) => {
  try {
    const { name, balance, currency, type } = walletSchema.parse(req.body);
    const wallet = await prisma.wallet.create({
      data: {
        userId: req.userId!,
        name,
        balance: balance ?? 0,
        currency: currency ?? 'USD',
        type: type ?? 'CASH',
      },
    });
    res.status(201).json(wallet);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      res.status(500).json({ error: 'Failed to create wallet' });
    }
  }
};

export const updateWallet = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const data = walletSchema.partial().parse(req.body);

    const wallet = await prisma.wallet.findUnique({ where: { id } });
    if (!wallet || wallet.userId !== req.userId) {
      res.status(404).json({ error: 'Wallet not found' });
      return;
    }

    const updated = await prisma.wallet.update({
      where: { id },
      data,
    });
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
       res.status(400).json({ error: error.issues });
    } else {
       res.status(500).json({ error: 'Failed to update wallet' });
    }
  }
};

export const deleteWallet = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const wallet = await prisma.wallet.findUnique({ where: { id } });
    if (!wallet || wallet.userId !== req.userId) {
      res.status(404).json({ error: 'Wallet not found' });
      return;
    }

    await prisma.wallet.delete({ where: { id } });
    res.json({ message: 'Wallet deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete wallet' });
  }
};

export const reorderWallets = async (req: AuthRequest, res: Response) => {
  try {
    const { walletIds } = req.body;
    if (!Array.isArray(walletIds)) {
      res.status(400).json({ error: 'walletIds must be an array' });
      return;
    }

    await prisma.$transaction(
      walletIds.map((id: string, index: number) =>
        prisma.wallet.update({
          where: { id, userId: req.userId },
          data: { order: index },
        })
      )
    );

    res.json({ message: 'Wallets reordered successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reorder wallets' });
  }
};

export const getWalletsSummary = async (req: AuthRequest, res: Response) => {
  try {
    const wallets = await prisma.wallet.findMany({
      where: { userId: req.userId },
    });

    const ratesMap = await getUSDRatesMap();
    
    const totalBalanceUSD = wallets.reduce((sum, wallet) => {
      const rate = ratesMap[wallet.currency] || 1;
      return sum + (wallet.balance * rate);
    }, 0);

    res.json({
      totalBalanceUSD,
      currency: 'USD',
      walletCount: wallets.length,
    });
  } catch (error) {
    console.error('Get Wallets Summary Error:', error);
    res.status(500).json({ error: 'Failed to fetch wallet summary' });
  }
};
