"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCategoryAnalytics = exports.deleteBudget = exports.updateBudget = exports.createBudget = exports.getBudgets = void 0;
const db_1 = require("../utils/db");
const zod_1 = require("zod");
const currencyService_1 = require("../services/currencyService");
const budgetSchema = zod_1.z.object({
    categoryId: zod_1.z.string().uuid(),
    limit: zod_1.z.number().positive(),
    startDate: zod_1.z.string().datetime(),
    endDate: zod_1.z.string().datetime(),
    status: zod_1.z.enum(['DRAFT', 'ACTIVE', 'FINISHED']).optional(),
    note: zod_1.z.string().max(500).optional(),
    currency: zod_1.z.string().optional(),
    periodId: zod_1.z.string().uuid().optional(),
});
const updateBudgetSchema = zod_1.z.object({
    limit: zod_1.z.number().positive().finite().optional(),
    startDate: zod_1.z.string().datetime().optional(),
    endDate: zod_1.z.string().datetime().optional(),
    status: zod_1.z.enum(['DRAFT', 'ACTIVE', 'FINISHED']).optional(),
    note: zod_1.z.string().max(500).optional(),
    currency: zod_1.z.string().optional(),
    periodId: zod_1.z.string().uuid().optional(),
});
const getBudgets = async (req, res) => {
    try {
        const budgets = await db_1.prisma.budget.findMany({
            where: { userId: req.userId },
            include: { category: true, period: true },
            orderBy: { startDate: 'desc' },
        });
        res.json(budgets);
    }
    catch (error) {
        console.error('Get Budgets Error:', error);
        res.status(500).json({ error: 'Failed to fetch budgets' });
    }
};
exports.getBudgets = getBudgets;
const createBudget = async (req, res) => {
    try {
        const data = budgetSchema.parse(req.body);
        const budget = await db_1.prisma.budget.create({
            data: {
                categoryId: data.categoryId,
                limit: data.limit,
                startDate: new Date(data.startDate),
                endDate: new Date(data.endDate),
                status: data.status || 'ACTIVE',
                note: data.note,
                currency: data.currency,
                periodId: data.periodId,
                userId: req.userId,
            },
        });
        res.status(201).json(budget);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
        }
        else {
            console.error('Create Budget Error:', error);
            res.status(500).json({ error: 'Failed to create budget' });
        }
    }
};
exports.createBudget = createBudget;
const updateBudget = async (req, res) => {
    try {
        const id = req.params.id;
        const data = updateBudgetSchema.parse(req.body);
        const existingBudget = await db_1.prisma.budget.findUnique({ where: { id } });
        if (!existingBudget || existingBudget.userId !== req.userId) {
            res.status(404).json({ error: 'Budget not found' });
            return;
        }
        const budget = await db_1.prisma.budget.update({
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
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
        }
        else {
            console.error('Update Budget Error:', error);
            res.status(500).json({ error: 'Failed to update budget' });
        }
    }
};
exports.updateBudget = updateBudget;
const deleteBudget = async (req, res) => {
    try {
        const id = String(req.params.id);
        const budget = await db_1.prisma.budget.findUnique({ where: { id } });
        if (!budget || budget.userId !== req.userId) {
            res.status(404).json({ error: 'Budget not found' });
            return;
        }
        await db_1.prisma.budget.delete({ where: { id } });
        res.json({ message: 'Budget deleted' });
    }
    catch (error) {
        console.error('Delete Budget Error:', error);
        res.status(500).json({ error: 'Failed to delete budget' });
    }
};
exports.deleteBudget = deleteBudget;
const getCategoryAnalytics = async (req, res) => {
    try {
        const categoryId = String(req.params.categoryId);
        // Verify category exists and belongs to user's data
        const category = await db_1.prisma.category.findUnique({ where: { id: categoryId } });
        if (!category) {
            res.status(404).json({ error: 'Category not found' });
            return;
        }
        // Fetch all budgets for this category belonging to the user
        const budgets = await db_1.prisma.budget.findMany({
            where: { userId: req.userId, categoryId },
            include: { period: true },
            orderBy: { startDate: 'asc' },
        });
        if (budgets.length === 0) {
            res.json({
                category: { id: category.id, name: category.name, color: category.color },
                dataPoints: [],
                summary: { totalPeriods: 0, avgSpent: 0, avgLimit: 0, trend: 'neutral' },
            });
            return;
        }
        const ratesMap = await (0, currencyService_1.getUSDRatesMap)();
        // Collect all transactions for this category belonging to the user
        const allTransactions = await db_1.prisma.transaction.findMany({
            where: {
                categoryId,
                type: 'EXPENSE',
                wallet: { userId: req.userId },
            },
            include: { wallet: true },
            orderBy: { date: 'asc' },
        });
        // Build data points — one per budget record
        const dataPoints = budgets.map((budget) => {
            const start = new Date(budget.startDate);
            const end = new Date(budget.endDate);
            const txInRange = allTransactions.filter((t) => {
                const d = new Date(t.date);
                return d >= start && d <= end;
            });
            const spentUSD = txInRange.reduce((sum, t) => {
                const rate = ratesMap[t.wallet.currency] || 1;
                return sum + t.amount * rate;
            }, 0);
            const limitUSD = budget.limit * (ratesMap[budget.currency] || 1);
            // Label: period name if in a period, otherwise date range
            let label;
            if (budget.period) {
                label = budget.period.name;
            }
            else {
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
        const finishedPoints = dataPoints.filter((p) => p.status === 'FINISHED' || p.status === 'ACTIVE');
        const totalPeriods = dataPoints.length;
        const avgSpent = finishedPoints.length > 0
            ? finishedPoints.reduce((s, p) => s + p.spentUSD, 0) / finishedPoints.length
            : 0;
        const avgLimit = finishedPoints.length > 0
            ? finishedPoints.reduce((s, p) => s + p.limitUSD, 0) / finishedPoints.length
            : 0;
        // Trend: compare last 2 finished periods
        let trend = 'neutral';
        if (finishedPoints.length >= 2) {
            const last = finishedPoints[finishedPoints.length - 1];
            const prev = finishedPoints[finishedPoints.length - 2];
            if (last.spentUSD > prev.spentUSD * 1.05)
                trend = 'up';
            else if (last.spentUSD < prev.spentUSD * 0.95)
                trend = 'down';
        }
        const bestPoint = finishedPoints.reduce((best, p) => (!best || p.percentage < best.percentage) ? p : best, null);
        const worstPoint = finishedPoints.reduce((worst, p) => (!worst || p.percentage > worst.percentage) ? p : worst, null);
        res.json({
            category: {
                id: category.id,
                name: category.name,
                color: category.color,
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
    }
    catch (error) {
        console.error('Get Category Analytics Error:', error);
        res.status(500).json({ error: 'Failed to fetch category analytics' });
    }
};
exports.getCategoryAnalytics = getCategoryAnalytics;
