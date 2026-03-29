"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBudget = exports.updateBudget = exports.createBudget = exports.getBudgets = void 0;
const db_1 = require("../utils/db");
const zod_1 = require("zod");
const budgetSchema = zod_1.z.object({
    categoryId: zod_1.z.string().uuid(),
    limit: zod_1.z.number().positive(),
    startDate: zod_1.z.string().datetime(),
    endDate: zod_1.z.string().datetime(),
    status: zod_1.z.enum(['DRAFT', 'ACTIVE', 'FINISHED']).optional(),
    note: zod_1.z.string().max(500).optional(),
});
const updateBudgetSchema = zod_1.z.object({
    limit: zod_1.z.number().positive().finite().optional(),
    startDate: zod_1.z.string().datetime().optional(),
    endDate: zod_1.z.string().datetime().optional(),
    status: zod_1.z.enum(['DRAFT', 'ACTIVE', 'FINISHED']).optional(),
    note: zod_1.z.string().max(500).optional(),
});
const getBudgets = async (req, res) => {
    try {
        const budgets = await db_1.prisma.budget.findMany({
            where: { userId: req.userId },
            include: { category: true },
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
