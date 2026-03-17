"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCredit = exports.updateCredit = exports.createCredit = exports.getCredits = void 0;
const db_1 = require("../utils/db");
const zod_1 = require("zod");
const creditSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    totalAmount: zod_1.z.number().positive(),
    paidAmount: zod_1.z.number().optional(),
    interestRate: zod_1.z.number().optional(),
    dueDate: zod_1.z.string().datetime().optional(),
});
const getCredits = async (req, res) => {
    try {
        const credits = await db_1.prisma.credit.findMany({ where: { userId: req.userId } });
        res.json(credits);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch credits' });
    }
};
exports.getCredits = getCredits;
const createCredit = async (req, res) => {
    try {
        const data = creditSchema.parse(req.body);
        const credit = await db_1.prisma.credit.create({
            data: {
                ...data,
                userId: req.userId,
                paidAmount: data.paidAmount ?? 0,
                interestRate: data.interestRate ?? 0,
                dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
            },
        });
        res.status(201).json(credit);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
        }
        else {
            res.status(500).json({ error: 'Failed to create credit' });
        }
    }
};
exports.createCredit = createCredit;
const updateCredit = async (req, res) => {
    try {
        const id = String(req.params.id);
        const data = creditSchema.partial().parse(req.body);
        const cb = await db_1.prisma.credit.findUnique({ where: { id } });
        if (!cb || cb.userId !== req.userId)
            return res.status(404).json({ error: 'Not found' });
        const updated = await db_1.prisma.credit.update({
            where: { id },
            data: {
                ...data,
                dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
            },
        });
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
};
exports.updateCredit = updateCredit;
const deleteCredit = async (req, res) => {
    try {
        const id = String(req.params.id);
        const cb = await db_1.prisma.credit.findUnique({ where: { id } });
        if (!cb || cb.userId !== req.userId)
            return res.status(404).json({ error: 'Not found' });
        await db_1.prisma.credit.delete({ where: { id } });
        res.json({ message: 'Deleted' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
};
exports.deleteCredit = deleteCredit;
