"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloneBudgetPeriod = exports.getPeriodAnalytics = exports.deleteBudgetPeriod = exports.updateBudgetPeriod = exports.createBudgetPeriod = exports.getBudgetPeriods = void 0;
const db_1 = require("../utils/db");
const zod_1 = require("zod");
const currencyService_1 = require("../services/currencyService");
const budgetPeriodSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    startDate: zod_1.z.string().datetime(),
    endDate: zod_1.z.string().datetime(),
    status: zod_1.z.enum(['DRAFT', 'ACTIVE', 'FINISHED']).optional(),
});
const updateBudgetPeriodSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100).optional(),
    startDate: zod_1.z.string().datetime().optional(),
    endDate: zod_1.z.string().datetime().optional(),
    status: zod_1.z.enum(['DRAFT', 'ACTIVE', 'FINISHED']).optional(),
});
const getBudgetPeriods = async (req, res) => {
    try {
        const periods = await db_1.prisma.budgetPeriod.findMany({
            where: { userId: req.userId },
            include: {
                budgets: {
                    include: { category: true }
                }
            },
            orderBy: { startDate: 'desc' },
        });
        res.json(periods);
    }
    catch (error) {
        console.error('Get Budget Periods Error:', error);
        res.status(500).json({ error: 'Failed to fetch budget periods' });
    }
};
exports.getBudgetPeriods = getBudgetPeriods;
const createBudgetPeriod = async (req, res) => {
    try {
        const data = budgetPeriodSchema.parse(req.body);
        const period = await db_1.prisma.budgetPeriod.create({
            data: {
                name: data.name,
                startDate: new Date(data.startDate),
                endDate: new Date(data.endDate),
                status: data.status || 'DRAFT',
                userId: req.userId,
            },
        });
        res.status(201).json(period);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
        }
        else {
            console.error('Create Budget Period Error:', error);
            res.status(500).json({ error: 'Failed to create budget period' });
        }
    }
};
exports.createBudgetPeriod = createBudgetPeriod;
const updateBudgetPeriod = async (req, res) => {
    try {
        const id = String(req.params.id);
        const data = updateBudgetPeriodSchema.parse(req.body);
        const period = await db_1.prisma.budgetPeriod.findUnique({ where: { id } });
        if (!period || period.userId !== req.userId) {
            res.status(404).json({ error: 'Budget period not found' });
            return;
        }
        const updatedPeriod = await db_1.prisma.budgetPeriod.update({
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
            await db_1.prisma.budget.updateMany({
                where: { periodId: id },
                data: { status: data.status }
            });
        }
        res.json(updatedPeriod);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
        }
        else {
            console.error('Update Budget Period Error:', error);
            res.status(500).json({ error: 'Failed to update budget period' });
        }
    }
};
exports.updateBudgetPeriod = updateBudgetPeriod;
const deleteBudgetPeriod = async (req, res) => {
    try {
        const id = String(req.params.id);
        const period = await db_1.prisma.budgetPeriod.findUnique({ where: { id } });
        if (!period || period.userId !== req.userId) {
            res.status(404).json({ error: 'Budget period not found' });
            return;
        }
        await db_1.prisma.budgetPeriod.delete({ where: { id } });
        res.json({ message: 'Budget period deleted' });
    }
    catch (error) {
        console.error('Delete Budget Period Error:', error);
        res.status(500).json({ error: 'Failed to delete budget period' });
    }
};
exports.deleteBudgetPeriod = deleteBudgetPeriod;
const getPeriodAnalytics = async (req, res) => {
    try {
        const id = String(req.params.id);
        const period = await db_1.prisma.budgetPeriod.findUnique({
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
        // 0. Fetch Rates for USD conversion
        const ratesMap = await (0, currencyService_1.getUSDRatesMap)();
        // 1. Get all transactions for the period
        const transactions = await db_1.prisma.transaction.findMany({
            where: {
                wallet: { userId: req.userId },
                date: {
                    gte: period.startDate,
                    lte: period.endDate,
                },
                type: 'EXPENSE',
            },
            include: { category: true, wallet: true },
            orderBy: { date: 'asc' }
        });
        // 1.1 Get all income transactions for the period
        const incomeTransactions = await db_1.prisma.transaction.findMany({
            where: {
                wallet: { userId: req.userId },
                date: {
                    gte: period.startDate,
                    lte: period.endDate,
                },
                type: 'INCOME',
            },
            include: { wallet: true },
        });
        const totalIncome = incomeTransactions.reduce((sum, t) => {
            const rate = ratesMap[t.wallet.currency] || 1;
            return sum + (t.amount * rate);
        }, 0);
        // 2. Calculate Category analytics in USD
        const budgets = period.budgets || [];
        const categoryAnalytics = budgets.map((budget) => {
            const spentUSD = transactions
                .filter((t) => t.categoryId === budget.categoryId)
                .reduce((sum, t) => {
                const rate = ratesMap[t.wallet.currency] || 1;
                return sum + (t.amount * rate);
            }, 0);
            const limitUSD = budget.limit * (ratesMap[budget.currency] || 1);
            return {
                categoryId: budget.categoryId,
                categoryName: budget.category.name,
                color: budget.category.color,
                limit: limitUSD,
                spent: spentUSD,
                currency: 'USD',
                percentage: limitUSD > 0 ? (spentUSD / limitUSD) * 100 : 0,
            };
        });
        const totalLimit = categoryAnalytics.reduce((sum, b) => sum + b.limit, 0);
        const totalSpent = categoryAnalytics.reduce((sum, a) => sum + a.spent, 0);
        // 3. Daily Spending Dynamics in USD
        const dailySpendingMap = {};
        let cumulative = 0;
        // Initialize map with all days in period
        const start = new Date(period.startDate);
        const end = new Date(period.endDate);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dailySpendingMap[d.toISOString().split('T')[0]] = { total: 0 };
        }
        transactions.forEach(t => {
            const day = new Date(t.date).toISOString().split('T')[0];
            if (dailySpendingMap[day] !== undefined) {
                const rate = ratesMap[t.wallet.currency] || 1;
                const amountUSD = t.amount * rate;
                dailySpendingMap[day].total += amountUSD;
                const catId = t.categoryId;
                if (!dailySpendingMap[day][catId]) {
                    dailySpendingMap[day][catId] = 0;
                }
                dailySpendingMap[day][catId] += amountUSD;
            }
        });
        const dailySpending = Object.entries(dailySpendingMap).map(([date, data]) => {
            cumulative += data.total;
            return {
                date,
                amount: data.total,
                cumulative,
                ...data
            };
        });
        // 4. Historical Intelligence (Period-over-Period) in USD
        const previousPeriod = await db_1.prisma.budgetPeriod.findFirst({
            where: {
                userId: req.userId,
                status: 'FINISHED',
                endDate: { lt: period.startDate }
            },
            orderBy: { endDate: 'desc' },
            include: {
                budgets: true
            }
        });
        let previousPeriodSummary = null;
        let prevTransactions = null;
        if (previousPeriod) {
            // Fetch previous period transactions to convert to USD
            prevTransactions = await db_1.prisma.transaction.findMany({
                where: {
                    wallet: { userId: req.userId },
                    date: {
                        gte: previousPeriod.startDate,
                        lte: previousPeriod.endDate,
                    },
                    type: 'EXPENSE',
                },
                include: { wallet: true }
            });
            const prevSpentUSD = prevTransactions.reduce((sum, t) => {
                const rate = ratesMap[t.wallet.currency] || 1;
                return sum + (t.amount * rate);
            }, 0);
            const prevLimitUSD = previousPeriod.budgets.reduce((sum, b) => {
                const rate = ratesMap[b.currency] || 1;
                return sum + (b.limit * rate);
            }, 0);
            previousPeriodSummary = {
                id: previousPeriod.id,
                name: previousPeriod.name,
                totalSpent: prevSpentUSD,
                totalLimit: prevLimitUSD
            };
        }
        // Planned Expenses Analytics
        const allPlannedExpenses = await db_1.prisma.plannedExpense.findMany({
            where: { userId: req.userId },
        });
        const plannedExpensesAnalytics = allPlannedExpenses.map(pe => {
            // Find transactions in CURRENT period
            const currentTransactions = transactions.filter(t => t.plannedExpenseId === pe.id);
            const currentSpent = currentTransactions.reduce((sum, t) => {
                const rate = ratesMap[t.wallet.currency] || 1;
                return sum + (t.amount * rate);
            }, 0);
            // Find transactions in PREVIOUS period (if any)
            let prevSpent = null;
            let prevCount = null;
            if (previousPeriodSummary && prevTransactions) {
                const pTx = prevTransactions.filter(t => t.plannedExpenseId === pe.id);
                prevCount = pTx.length;
                prevSpent = pTx.reduce((sum, t) => {
                    const rate = ratesMap[t.wallet.currency] || 1;
                    return sum + (t.amount * rate);
                }, 0);
            }
            return {
                id: pe.id,
                name: pe.name,
                expectedAmountUSD: pe.expectedAmount * (ratesMap[pe.currency] || 1),
                currentSpent,
                currentCount: currentTransactions.length,
                prevSpent,
                prevCount,
            };
        }).filter(p => p.currentCount > 0 || (p.prevCount && p.prevCount > 0));
        // 5. Deep Dives (Top Hits) in USD
        const topTransactions = transactions
            .map(t => {
            const rate = ratesMap[t.wallet.currency] || 1;
            return {
                id: t.id,
                description: t.description || t.category.name,
                amount: t.amount * rate,
                originalAmount: t.amount,
                originalCurrency: t.wallet.currency,
                date: t.date,
                categoryName: t.category.name,
                isFixed: !!(t.subscriptionId || t.creditId)
            };
        })
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5);
        const fixedSpent = transactions
            .filter(t => t.subscriptionId || t.creditId)
            .reduce((sum, t) => {
            const rate = ratesMap[t.wallet.currency] || 1;
            return sum + (t.amount * rate);
        }, 0);
        res.json({
            periodName: period.name,
            startDate: period.startDate,
            endDate: period.endDate,
            totalLimit: totalLimit || 0,
            totalSpent: totalSpent || 0,
            totalIncome: totalIncome || 0,
            currency: 'USD',
            categories: categoryAnalytics || [],
            dailySpending: dailySpending || [],
            previousPeriodSummary: previousPeriodSummary || null,
            topTransactions: topTransactions || [],
            plannedExpenses: plannedExpensesAnalytics || [],
            composition: {
                fixed: fixedSpent || 0,
                variable: (totalSpent || 0) - (fixedSpent || 0)
            }
        });
    }
    catch (error) {
        console.error('Get Period Analytics Error:', error);
        res.status(500).json({ error: 'Failed to fetch period analytics' });
    }
};
exports.getPeriodAnalytics = getPeriodAnalytics;
const cloneBudgetPeriod = async (req, res) => {
    try {
        const id = String(req.params.id);
        const originalPeriod = await db_1.prisma.budgetPeriod.findUnique({
            where: { id },
            include: { budgets: true }
        });
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
        const result = await db_1.prisma.$transaction(async (tx) => {
            // 1. Create the new period
            const newPeriod = await tx.budgetPeriod.create({
                data: {
                    name: `Draft: ${originalPeriod.name}`,
                    startDate: nextStart,
                    endDate: nextEnd,
                    status: 'DRAFT',
                    userId: req.userId,
                },
            });
            // 2. Clone all budgets
            if (originalPeriod.budgets && originalPeriod.budgets.length > 0) {
                await tx.budget.createMany({
                    data: originalPeriod.budgets.map((b) => ({
                        userId: req.userId,
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
    }
    catch (error) {
        console.error('Clone Budget Period Error:', error);
        res.status(500).json({ error: 'Failed to clone budget period' });
    }
};
exports.cloneBudgetPeriod = cloneBudgetPeriod;
