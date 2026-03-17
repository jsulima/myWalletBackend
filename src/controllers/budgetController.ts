import { Response } from 'express';
import { prisma } from '../utils/db';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware';

const budgetSchema = z.object({
  categoryId: z.string().uuid(),
  limit: z.number().positive(),
  month: z.number().min(1).max(12),
  year: z.number().min(2000),
});

export const getBudgets = async (req: AuthRequest, res: Response) => {
  try {
    const budgets = await prisma.budget.findMany({
      where: { userId: req.userId },
      include: { category: true },
    });
    res.json(budgets);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
};

export const createBudget = async (req: AuthRequest, res: Response) => {
  try {
    const data = budgetSchema.parse(req.body);
    const budget = await prisma.budget.create({
      data: {
        ...data,
        userId: req.userId!,
      },
    });
    res.status(201).json(budget);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      res.status(500).json({ error: 'Failed to create budget. Maybe already exists for this month/year?' });
    }
  }
};

export const deleteBudget = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const budget = await prisma.budget.findUnique({ where: { id } });
    if (!budget || budget.userId !== req.userId) {
      res.status(404).json({ error: 'Budget not found' });
      return;
    }
    await prisma.budget.delete({ where: { id } });
    res.json({ message: 'Budget deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete budget' });
  }
};
