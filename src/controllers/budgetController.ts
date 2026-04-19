import { Response } from 'express';
import { prisma } from '../utils/db';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware';

const budgetSchema = z.object({
  categoryId: z.string().uuid(),
  limit: z.number().positive(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  status: z.enum(['DRAFT', 'ACTIVE', 'FINISHED']).optional(),
  note: z.string().max(500).optional(),
  currency: z.string().optional(),
  periodId: z.string().uuid().optional(),
});

const updateBudgetSchema = z.object({
  limit: z.number().positive().finite().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'FINISHED']).optional(),
  note: z.string().max(500).optional(),
  currency: z.string().optional(),
  periodId: z.string().uuid().optional(),
});

export const getBudgets = async (req: AuthRequest, res: Response) => {
  try {
    const budgets = await prisma.budget.findMany({
      where: { userId: req.userId },
      include: { category: true, period: true },
      orderBy: { startDate: 'desc' },
    });
    res.json(budgets);
  } catch (error) {
    console.error('Get Budgets Error:', error);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
};

export const createBudget = async (req: AuthRequest, res: Response) => {
  try {
    const data = budgetSchema.parse(req.body);
    const budget = await prisma.budget.create({
      data: {
        categoryId: data.categoryId,
        limit: data.limit,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: data.status || 'ACTIVE',
        note: data.note,
        currency: data.currency,
        periodId: data.periodId,
        userId: req.userId!,
      },
    });
    res.status(201).json(budget);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      console.error('Create Budget Error:', error);
      res.status(500).json({ error: 'Failed to create budget' });
    }
  }
};

export const updateBudget = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const data = updateBudgetSchema.parse(req.body);

    const existingBudget = await prisma.budget.findUnique({ where: { id } });
    if (!existingBudget || existingBudget.userId !== req.userId) {
      res.status(404).json({ error: 'Budget not found' });
      return;
    }

    const budget = await prisma.budget.update({
      where: { id },
      data: {
        limit: data.limit,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        status: data.status,
        note: data.note,
        currency: data.currency,
        periodId: data.periodId,
      },
    });

    res.json(budget);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      console.error('Update Budget Error:', error);
      res.status(500).json({ error: 'Failed to update budget' });
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
    console.error('Delete Budget Error:', error);
    res.status(500).json({ error: 'Failed to delete budget' });
  }
};
