"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSaving = exports.updateSaving = exports.createSaving = exports.getSavings = void 0;
const db_1 = require("../utils/db");
const zod_1 = require("zod");
const savingSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    targetAmount: zod_1.z.number().positive(),
    currentAmount: zod_1.z.number().optional(),
    deadline: zod_1.z.string().datetime().optional(),
});
const getSavings = async (req, res) => {
    try {
        const savings = await db_1.prisma.savingGoal.findMany({ where: { userId: req.userId } });
        res.json(savings);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch savings' });
    }
};
exports.getSavings = getSavings;
const createSaving = async (req, res) => {
    try {
        const data = savingSchema.parse(req.body);
        const saving = await db_1.prisma.savingGoal.create({
            data: {
                ...data,
                userId: req.userId,
                currentAmount: data.currentAmount ?? 0,
                deadline: data.deadline ? new Date(data.deadline) : undefined,
            },
        });
        res.status(201).json(saving);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
        }
        else {
            res.status(500).json({ error: 'Failed to create saving goal' });
        }
    }
};
exports.createSaving = createSaving;
const updateSaving = async (req, res) => {
    try {
        const id = String(req.params.id);
        const data = savingSchema.partial().parse(req.body);
        const saving = await db_1.prisma.savingGoal.findUnique({ where: { id } });
        if (!saving || saving.userId !== req.userId)
            return res.status(404).json({ error: 'Not found' });
        const updated = await db_1.prisma.savingGoal.update({
            where: { id },
            data: {
                ...data,
                deadline: data.deadline ? new Date(data.deadline) : undefined,
            },
        });
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
};
exports.updateSaving = updateSaving;
const deleteSaving = async (req, res) => {
    try {
        const id = String(req.params.id);
        const saving = await db_1.prisma.savingGoal.findUnique({ where: { id } });
        if (!saving || saving.userId !== req.userId)
            return res.status(404).json({ error: 'Not found' });
        await db_1.prisma.savingGoal.delete({ where: { id } });
        res.json({ message: 'Deleted' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
};
exports.deleteSaving = deleteSaving;
