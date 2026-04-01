import { Response } from 'express';
import { prisma } from '../utils/db';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware';

const budgetPeriodSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  status: z.enum(['DRAFT', 'ACTIVE', 'FINISHED']).optional(),
});

const updateBudgetPeriodSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'FINISHED']).optional(),
});

export const getBudgetPeriods = async (req: AuthRequest, res: Response) => {
  try {
    const periods = await prisma.budgetPeriod.findMany({
      where: { userId: req.userId },
      include: { 
        budgets: {
          include: { category: true }
        }
      },
      orderBy: { startDate: 'desc' },
    });
    res.json(periods);
  } catch (error) {
    console.error('Get Budget Periods Error:', error);
    res.status(500).json({ error: 'Failed to fetch budget periods' });
  }
};

export const createBudgetPeriod = async (req: AuthRequest, res: Response) => {
  try {
    const data = budgetPeriodSchema.parse(req.body);
    const period = await prisma.budgetPeriod.create({
      data: {
        name: data.name,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: data.status || 'DRAFT',
        userId: req.userId!,
      },
    });
    res.status(201).json(period);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      console.error('Create Budget Period Error:', error);
      res.status(500).json({ error: 'Failed to create budget period' });
    }
  }
};

export const updateBudgetPeriod = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const data = updateBudgetPeriodSchema.parse(req.body);

    const period = await prisma.budgetPeriod.findUnique({ where: { id } });
    if (!period || period.userId !== req.userId) {
      res.status(404).json({ error: 'Budget period not found' });
      return;
    }

    const updatedPeriod = await prisma.budgetPeriod.update({
      where: { id },
      data: {
        name: data.name,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        status: data.status,
      },
    });

    // If period status is changed, update all associated budgets
    if (data.status) {
      await prisma.budget.updateMany({
        where: { periodId: id },
        data: { status: data.status }
      });
    }

    res.json(updatedPeriod);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      console.error('Update Budget Period Error:', error);
      res.status(500).json({ error: 'Failed to update budget period' });
    }
  }
};

export const deleteBudgetPeriod = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const period = await prisma.budgetPeriod.findUnique({ where: { id } });
    if (!period || period.userId !== req.userId) {
      res.status(404).json({ error: 'Budget period not found' });
      return;
    }
    await prisma.budgetPeriod.delete({ where: { id } });
    res.json({ message: 'Budget period deleted' });
  } catch (error) {
    console.error('Delete Budget Period Error:', error);
    res.status(500).json({ error: 'Failed to delete budget period' });
  }
};

export const getPeriodAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const period = await prisma.budgetPeriod.findUnique({
      where: { id },
      include: { 
        budgets: {
          include: { category: true }
        }
      }
    });

    if (!period || period.userId !== req.userId) {
      res.status(404).json({ error: 'Budget period not found' });
      return;
    }

    // Get all transactions for the period
    const transactions = await (prisma.transaction.findMany({
      where: {
        wallet: { userId: req.userId },
        date: {
          gte: period.startDate,
          lte: period.endDate,
        },
        type: 'EXPENSE',
      },
      include: { category: true, wallet: true },
    }) as Promise<any[]>);

    // Calculate analytics
    const analytics = period.budgets.map((budget: any) => {
      const spent = transactions
        .filter((t: any) => t.categoryId === budget.categoryId)
        .reduce((sum: number, t: any) => sum + t.amount, 0);

      return {
        categoryId: budget.categoryId,
        categoryName: budget.category.name,
        color: budget.category.color,
        limit: budget.limit,
        spent,
        currency: budget.currency,
        percentage: budget.limit > 0 ? (spent / budget.limit) * 100 : 0,
      };
    });

    const totalLimit = period.budgets.reduce((sum: number, b: any) => sum + b.limit, 0);
    const totalSpent = analytics.reduce((sum: number, a: any) => sum + a.spent, 0);

    res.json({
      periodName: period.name,
      startDate: period.startDate,
      endDate: period.endDate,
      totalLimit,
      totalSpent,
      categories: analytics,
    });
  } catch (error) {
    console.error('Get Period Analytics Error:', error);
    res.status(500).json({ error: 'Failed to fetch period analytics' });
  }
};

export const cloneBudgetPeriod = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    const originalPeriod = await prisma.budgetPeriod.findUnique({
      where: { id },
      include: { budgets: true }
    }) as (any & { budgets: any[] });

    if (!originalPeriod || originalPeriod.userId !== req.userId) {
      res.status(404).json({ error: 'Budget period not found' });
      return;
    }

    // Determine the next cycle dates (e.g., next 30 days)
    const nextStart = new Date(originalPeriod.endDate);
    nextStart.setDate(nextStart.getDate() + 1);
    nextStart.setHours(0, 0, 0, 0);

    const nextEnd = new Date(nextStart);
    nextEnd.setDate(nextEnd.getDate() + 30);
    nextEnd.setHours(23, 59, 59, 999);

    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Create the new period
      const newPeriod = await tx.budgetPeriod.create({
        data: {
          name: `Draft: ${originalPeriod.name}`,
          startDate: nextStart,
          endDate: nextEnd,
          status: 'DRAFT',
          userId: req.userId!,
        },
      });

      // 2. Clone all budgets
      if (originalPeriod.budgets && originalPeriod.budgets.length > 0) {
        await tx.budget.createMany({
          data: originalPeriod.budgets.map((b: any) => ({
            userId: req.userId!,
            categoryId: b.categoryId,
            limit: b.limit,
            startDate: nextStart,
            endDate: nextEnd,
            status: 'DRAFT',
            note: b.note,
            currency: b.currency,
            periodId: newPeriod.id
          }))
        });
      }

      return newPeriod;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Clone Budget Period Error:', error);
    res.status(500).json({ error: 'Failed to clone budget period' });
  }
};
