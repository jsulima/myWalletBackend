"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePlannedExpense = exports.updatePlannedExpense = exports.createPlannedExpense = exports.getPlannedExpenses = void 0;
const db_1 = require("../utils/db");
const zod_1 = require("zod");
const plannedExpenseSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    expectedAmount: zod_1.z.number().positive(),
    currency: zod_1.z.string().optional(),
    categoryId: zod_1.z.string().uuid(),
    dueDay: zod_1.z.number().min(1).max(31).nullable().optional(),
    frequency: zod_1.z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
});
const updatePlannedExpenseSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100).optional(),
    expectedAmount: zod_1.z.number().positive().optional(),
    currency: zod_1.z.string().optional(),
    categoryId: zod_1.z.string().uuid().optional(),
    dueDay: zod_1.z.number().min(1).max(31).nullable().optional(),
    frequency: zod_1.z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
});
const getPlannedExpenses = async (req, res) => {
    try {
        const plannedExpenses = await db_1.prisma.plannedExpense.findMany({
            where: { userId: req.userId },
            include: { category: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(plannedExpenses);
    }
    catch (error) {
        console.error('Get Planned Expenses Error:', error);
        res.status(500).json({ error: 'Failed to fetch planned expenses' });
    }
};
exports.getPlannedExpenses = getPlannedExpenses;
const createPlannedExpense = async (req, res) => {
    try {
        const data = plannedExpenseSchema.parse(req.body);
        const plannedExpense = await db_1.prisma.plannedExpense.create({
            data: {
                name: data.name,
                expectedAmount: data.expectedAmount,
                currency: data.currency,
                categoryId: data.categoryId,
                dueDay: data.dueDay,
                frequency: data.frequency || 'MONTHLY',
                userId: req.userId,
            },
        });
        res.status(201).json(plannedExpense);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
        }
        else {
            console.error('Create Planned Expense Error:', error);
            res.status(500).json({ error: 'Failed to create planned expense' });
        }
    }
};
exports.createPlannedExpense = createPlannedExpense;
const updatePlannedExpense = async (req, res) => {
    try {
        const id = req.params.id;
        const data = updatePlannedExpenseSchema.parse(req.body);
        const existingExpense = await db_1.prisma.plannedExpense.findUnique({ where: { id } });
        if (!existingExpense || existingExpense.userId !== req.userId) {
            res.status(404).json({ error: 'Planned expense not found' });
            return;
        }
        const plannedExpense = await db_1.prisma.plannedExpense.update({
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
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
        }
        else {
            console.error('Update Planned Expense Error:', error);
            res.status(500).json({ error: 'Failed to update planned expense' });
        }
    }
};
exports.updatePlannedExpense = updatePlannedExpense;
const deletePlannedExpense = async (req, res) => {
    try {
        const id = req.params.id;
        const existingExpense = await db_1.prisma.plannedExpense.findUnique({ where: { id } });
        if (!existingExpense || existingExpense.userId !== req.userId) {
            res.status(404).json({ error: 'Planned expense not found' });
            return;
        }
        await db_1.prisma.plannedExpense.delete({ where: { id } });
        res.status(204).send();
    }
    catch (error) {
        console.error('Delete Planned Expense Error:', error);
        res.status(500).json({ error: 'Failed to delete planned expense' });
    }
};
exports.deletePlannedExpense = deletePlannedExpense;
