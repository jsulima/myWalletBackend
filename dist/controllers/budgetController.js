"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBudget = exports.createBudget = exports.getBudgets = void 0;
const db_1 = require("../utils/db");
const zod_1 = require("zod");
const budgetSchema = zod_1.z.object({
    categoryId: zod_1.z.string().uuid(),
    limit: zod_1.z.number().positive(),
    month: zod_1.z.number().min(1).max(12),
    year: zod_1.z.number().min(2000),
});
const getBudgets = async (req, res) => {
    try {
        const budgets = await db_1.prisma.budget.findMany({
            where: { userId: req.userId },
            include: { category: true },
        });
        res.json(budgets);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch budgets' });
    }
};
exports.getBudgets = getBudgets;
const createBudget = async (req, res) => {
    try {
        const data = budgetSchema.parse(req.body);
        const budget = await db_1.prisma.budget.create({
            data: {
                ...data,
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
            res.status(500).json({ error: 'Failed to create budget. Maybe already exists for this month/year?' });
        }
    }
};
exports.createBudget = createBudget;
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
        res.status(500).json({ error: 'Failed to delete budget' });
    }
};
exports.deleteBudget = deleteBudget;
