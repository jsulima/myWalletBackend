import { Response } from 'express';
import { prisma } from '../utils/db';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware';
import { getUSDRatesMap } from '../services/currencyService';

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

export const getCategoryAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const categoryId = String(req.params.categoryId);

    // Verify category exists and belongs to user's data
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }

    // Fetch all budgets for this category belonging to the user
    const budgets = await (prisma.budget.findMany({
      where: { userId: req.userId, categoryId },
      include: { period: true },
      orderBy: { startDate: 'asc' },
    }) as Promise<any[]>);

    if (budgets.length === 0) {
      res.json({
        category: { id: category.id, name: category.name, color: (category as any).color },
        dataPoints: [],
        summary: { totalPeriods: 0, avgSpent: 0, avgLimit: 0, trend: 'neutral' },
      });
      return;
    }

    const ratesMap = await getUSDRatesMap();

    // Collect all transactions for this category belonging to the user
    const allTransactions = await (prisma.transaction.findMany({
      where: {
        categoryId,
        type: 'EXPENSE',
        wallet: { userId: req.userId },
      },
      include: { wallet: true },
      orderBy: { date: 'asc' },
    }) as Promise<any[]>);

    // Build data points — one per budget record
    const dataPoints = budgets.map((budget: any) => {
      const start = new Date(budget.startDate);
      const end = new Date(budget.endDate);

      const txInRange = allTransactions.filter((t: any) => {
        const d = new Date(t.date);
        return d >= start && d <= end;
      });

      const spentUSD = txInRange.reduce((sum: number, t: any) => {
        const rate = ratesMap[t.wallet.currency] || 1;
        return sum + t.amount * rate;
      }, 0);

      const limitUSD = budget.limit * (ratesMap[budget.currency] || 1);

      // Label: period name if in a period, otherwise date range
      let label: string;
      if (budget.period) {
        label = budget.period.name;
      } else {
        label = `${start.toLocaleDateString('uk-UA', { month: 'short', year: '2-digit' })}`;
      }

      return {
        budgetId: budget.id,
        periodId: budget.periodId || null,
        periodName: budget.period?.name || null,
        label,
        startDate: budget.startDate,
        endDate: budget.endDate,
        status: budget.status,
        limitUSD: Math.round(limitUSD * 100) / 100,
        spentUSD: Math.round(spentUSD * 100) / 100,
        transactionCount: txInRange.length,
        percentage: limitUSD > 0 ? Math.round((spentUSD / limitUSD) * 100) : 0,
        isOver: spentUSD > limitUSD,
      };
    });

    // Summary statistics
    const finishedPoints = dataPoints.filter((p: any) => p.status === 'FINISHED' || p.status === 'ACTIVE');
    const totalPeriods = dataPoints.length;
    const avgSpent = finishedPoints.length > 0
      ? finishedPoints.reduce((s: number, p: any) => s + p.spentUSD, 0) / finishedPoints.length
      : 0;
    const avgLimit = finishedPoints.length > 0
      ? finishedPoints.reduce((s: number, p: any) => s + p.limitUSD, 0) / finishedPoints.length
      : 0;

    // Trend: compare last 2 finished periods
    let trend: 'up' | 'down' | 'neutral' = 'neutral';
    if (finishedPoints.length >= 2) {
      const last = finishedPoints[finishedPoints.length - 1];
      const prev = finishedPoints[finishedPoints.length - 2];
      if (last.spentUSD > prev.spentUSD * 1.05) trend = 'up';
      else if (last.spentUSD < prev.spentUSD * 0.95) trend = 'down';
    }

    const bestPoint = finishedPoints.reduce((best: any, p: any) =>
      (!best || p.percentage < best.percentage) ? p : best, null);
    const worstPoint = finishedPoints.reduce((worst: any, p: any) =>
      (!worst || p.percentage > worst.percentage) ? p : worst, null);

    res.json({
      category: {
        id: category.id,
        name: category.name,
        color: (category as any).color,
      },
      dataPoints,
      summary: {
        totalPeriods,
        avgSpent: Math.round(avgSpent * 100) / 100,
        avgLimit: Math.round(avgLimit * 100) / 100,
        trend,
        bestPeriod: bestPoint ? { label: bestPoint.label, percentage: bestPoint.percentage } : null,
        worstPeriod: worstPoint ? { label: worstPoint.label, percentage: worstPoint.percentage } : null,
      },
    });
  } catch (error) {
    console.error('Get Category Analytics Error:', error);
    res.status(500).json({ error: 'Failed to fetch category analytics' });
  }
};

