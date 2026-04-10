import { Response } from 'express';
import { prisma } from '../utils/db';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware';

import { convertAmount } from '../services/currencyService';

const creditSchema = z.object({
  name: z.string().min(1),
  totalAmount: z.number().positive(),
  remainingAmount: z.number().optional(),
  paidAmount: z.number().optional(),
  interestRate: z.number().optional(),
  monthlyPayment: z.number().optional(),
  dueDate: z.string().datetime().optional(),
  currency: z.string().optional().default('USD'),
});

export const getCredits = async (req: AuthRequest, res: Response) => {
  try {
    const credits = await prisma.credit.findMany({ where: { userId: req.userId } });
    res.json(credits);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch credits' });
  }
};

export const createCredit = async (req: AuthRequest, res: Response) => {
  try {
    const data = creditSchema.parse(req.body);
    const remainingAmount = data.remainingAmount ?? (data.totalAmount - (data.paidAmount ?? 0));
    const credit = await prisma.credit.create({
      data: {
        userId: req.userId!,
        name: data.name,
        totalAmount: data.totalAmount,
        paidAmount: data.paidAmount ?? 0,
        remainingAmount,
        interestRate: data.interestRate ?? 0,
        monthlyPayment: data.monthlyPayment ?? 0,
        currency: data.currency,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      },
    });
    res.status(201).json(credit);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      res.status(500).json({ error: 'Failed to create credit' });
    }
  }
};

export const updateCredit = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const data = creditSchema.partial().parse(req.body);
    const cb = await prisma.credit.findUnique({ where: { id } });
    if (!cb || cb.userId !== req.userId) return res.status(404).json({ error: 'Not found' });

    const updated = await prisma.credit.update({
      where: { id },
      data: {
         ...data,
         dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      },
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
};

export const deleteCredit = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const cb = await prisma.credit.findUnique({ where: { id } });
    if (!cb || cb.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
    await prisma.credit.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
};

const payCreditSchema = z.object({
  walletId: z.string().uuid(),
  categoryId: z.string().uuid(),
  amount: z.number().positive(),
  date: z.string().datetime().optional(), // ISO string
});

export const payCredit = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const data = payCreditSchema.parse(req.body);

    const credit = await prisma.credit.findUnique({ where: { id } });
    if (!credit || credit.userId !== req.userId) {
      return res.status(404).json({ error: 'Credit not found' });
    }

    const wallet = await prisma.wallet.findUnique({ where: { id: data.walletId } });
    if (!wallet || wallet.userId !== req.userId) {
      return res.status(403).json({ error: 'Access denied to this wallet' });
    }

    const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!category || category.userId !== req.userId && category.userId !== null) {
       return res.status(403).json({ error: 'Access denied to this category' });
    }

    // Currency Conversion for Wallet Decrement
    const { convertedAmount: walletAmount, rate } = await convertAmount(data.amount, credit.currency, wallet.currency);
    
    console.log(`Converting ${data.amount} ${credit.currency} to ${walletAmount} ${wallet.currency} for payment at rate ${rate}`);

    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Decrement Wallet Balance
      await tx.wallet.update({
        where: { id: data.walletId },
        data: { balance: { decrement: walletAmount } },
      });

      // 2. Create Transaction
      const description = wallet.currency !== credit.currency
        ? `Credit Payment: ${credit.name} (${data.amount} ${credit.currency} at rate ${rate.toFixed(4)})`
        : `Credit Payment: ${credit.name}`;

      const transaction = await tx.transaction.create({
        data: {
          walletId: data.walletId,
          categoryId: data.categoryId,
          type: 'EXPENSE',
          amount: walletAmount,
          creditId: id,
          creditAmount: data.amount,
          description,
          date: data.date ? new Date(data.date) : new Date(),
        },
      });

      // 3. Update Credit Balance
      const updatedCredit = await tx.credit.update({
        where: { id },
        data: {
          paidAmount: { increment: data.amount },
          remainingAmount: { decrement: data.amount },
        },
      });

      return { transaction, credit: updatedCredit };
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
    }
  }
};


