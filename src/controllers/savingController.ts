import { Response } from 'express';
import { prisma } from '../utils/db';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware';

const savingSchema = z.object({
  name: z.string().min(1),
  targetAmount: z.number().positive(),
  currentAmount: z.number().optional(),
  currency: z.string().optional(),
  deadline: z.string().datetime().optional(),
});

export const getSavings = async (req: AuthRequest, res: Response) => {
  try {
    const savings = await prisma.savingGoal.findMany({ where: { userId: req.userId } });
    res.json(savings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch savings' });
  }
};

export const createSaving = async (req: AuthRequest, res: Response) => {
  try {
    const data = savingSchema.parse(req.body);
    const saving = await prisma.savingGoal.create({
      data: {
        ...data,
        userId: req.userId!,
        currentAmount: data.currentAmount ?? 0,
        currency: data.currency,
        deadline: data.deadline ? new Date(data.deadline) : undefined,
      },
    });
    res.status(201).json(saving);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      res.status(500).json({ error: 'Failed to create saving goal' });
    }
  }
};

export const updateSaving = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const data = savingSchema.partial().parse(req.body);
    const saving = await prisma.savingGoal.findUnique({ where: { id } });
    if (!saving || saving.userId !== req.userId) return res.status(404).json({ error: 'Not found' });

    const updated = await prisma.savingGoal.update({
      where: { id },
      data: {
         ...data,
         deadline: data.deadline ? new Date(data.deadline) : undefined,
      },
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
};

export const deleteSaving = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const saving = await prisma.savingGoal.findUnique({ where: { id } });
    if (!saving || saving.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
    await prisma.savingGoal.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
};
