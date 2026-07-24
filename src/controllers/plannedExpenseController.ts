import { Response } from 'express';
import { prisma } from '../utils/db';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware';

const plannedExpenseSchema = z.object({
  name: z.string().min(1).max(100),
  expectedAmount: z.number().positive(),
  currency: z.string().optional(),
  categoryId: z.string().uuid(),
  dueDay: z.number().min(1).max(31).nullable().optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
});

const updatePlannedExpenseSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  expectedAmount: z.number().positive().optional(),
  currency: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  dueDay: z.number().min(1).max(31).nullable().optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
});

export const getPlannedExpenses = async (req: AuthRequest, res: Response) => {
  try {
    const plannedExpenses = await prisma.plannedExpense.findMany({
      where: { userId: req.userId },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(plannedExpenses);
  } catch (error) {
    console.error('Get Planned Expenses Error:', error);
    res.status(500).json({ error: 'Failed to fetch planned expenses' });
  }
};

export const createPlannedExpense = async (req: AuthRequest, res: Response) => {
  try {
    const data = plannedExpenseSchema.parse(req.body);
    const plannedExpense = await prisma.plannedExpense.create({
      data: {
        name: data.name,
        expectedAmount: data.expectedAmount,
        currency: data.currency,
        categoryId: data.categoryId,
        dueDay: data.dueDay,
        frequency: data.frequency || 'MONTHLY',
        userId: req.userId!,
      },
    });
    res.status(201).json(plannedExpense);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      console.error('Create Planned Expense Error:', error);
      res.status(500).json({ error: 'Failed to create planned expense' });
    }
  }
};

export const updatePlannedExpense = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const data = updatePlannedExpenseSchema.parse(req.body);

    const existingExpense = await prisma.plannedExpense.findUnique({ where: { id } });
    if (!existingExpense || existingExpense.userId !== req.userId) {
      res.status(404).json({ error: 'Planned expense not found' });
      return;
    }

    const plannedExpense = await prisma.plannedExpense.update({
      where: { id },
      data: {
        name: data.name,
        expectedAmount: data.expectedAmount,
        currency: data.currency,
        categoryId: data.categoryId,
        dueDay: data.dueDay,
        frequency: data.frequency,
      },
    });

    res.json(plannedExpense);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      console.error('Update Planned Expense Error:', error);
      res.status(500).json({ error: 'Failed to update planned expense' });
    }
  }
};

export const deletePlannedExpense = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    
    const existingExpense = await prisma.plannedExpense.findUnique({ where: { id } });
    if (!existingExpense || existingExpense.userId !== req.userId) {
      res.status(404).json({ error: 'Planned expense not found' });
      return;
    }

    await prisma.plannedExpense.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Delete Planned Expense Error:', error);
    res.status(500).json({ error: 'Failed to delete planned expense' });
  }
};
