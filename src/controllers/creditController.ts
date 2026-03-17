import { Response } from 'express';
import { prisma } from '../utils/db';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware';

const creditSchema = z.object({
  name: z.string().min(1),
  totalAmount: z.number().positive(),
  remainingAmount: z.number().optional(),
  paidAmount: z.number().optional(),
  interestRate: z.number().optional(),
  monthlyPayment: z.number().optional(),
  dueDate: z.string().datetime().optional(),
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
