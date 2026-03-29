"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payCredit = exports.deleteCredit = exports.updateCredit = exports.createCredit = exports.getCredits = void 0;
const db_1 = require("../utils/db");
const zod_1 = require("zod");
const creditSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    totalAmount: zod_1.z.number().positive(),
    remainingAmount: zod_1.z.number().optional(),
    paidAmount: zod_1.z.number().optional(),
    interestRate: zod_1.z.number().optional(),
    monthlyPayment: zod_1.z.number().optional(),
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
        const remainingAmount = data.remainingAmount ?? (data.totalAmount - (data.paidAmount ?? 0));
        const credit = await db_1.prisma.credit.create({
            data: {
                userId: req.userId,
                name: data.name,
                totalAmount: data.totalAmount,
                paidAmount: data.paidAmount ?? 0,
                remainingAmount,
                interestRate: data.interestRate ?? 0,
                monthlyPayment: data.monthlyPayment ?? 0,
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
const payCreditSchema = zod_1.z.object({
    walletId: zod_1.z.string().uuid(),
    categoryId: zod_1.z.string().uuid(),
    amount: zod_1.z.number().positive(),
    date: zod_1.z.string().datetime().optional(), // ISO string
});
const payCredit = async (req, res) => {
    try {
        const id = String(req.params.id);
        const data = payCreditSchema.parse(req.body);
        const credit = await db_1.prisma.credit.findUnique({ where: { id } });
        if (!credit || credit.userId !== req.userId) {
            return res.status(404).json({ error: 'Credit not found' });
        }
        const wallet = await db_1.prisma.wallet.findUnique({ where: { id: data.walletId } });
        if (!wallet || wallet.userId !== req.userId) {
            return res.status(403).json({ error: 'Access denied to this wallet' });
        }
        const category = await db_1.prisma.category.findUnique({ where: { id: data.categoryId } });
        if (!category || category.userId !== req.userId && category.userId !== null) {
            return res.status(403).json({ error: 'Access denied to this category' });
        }
        const result = await db_1.prisma.$transaction(async (tx) => {
            // 1. Decrement Wallet Balance
            await tx.wallet.update({
                where: { id: data.walletId },
                data: { balance: { decrement: data.amount } },
            });
            // 2. Create Transaction
            const transaction = await tx.transaction.create({
                data: {
                    walletId: data.walletId,
                    categoryId: data.categoryId,
                    type: 'EXPENSE',
                    amount: data.amount,
                    description: `Credit Payment: ${credit.name}`,
                    date: data.date ? new Date(data.date) : new Date(),
                },
            });
            // 3. Update Credit Balance
            const updatedCredit = await tx.credit.update({
                where: { id },
                data: {
                    paidAmount: { increment: data.amount },
                    remainingAmount: { decrement: data.amount },
                },
            });
            return { transaction, credit: updatedCredit };
        });
        res.json(result);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
        }
        else {
            res.status(500).json({ error: 'Failed to process payment' });
        }
    }
};
exports.payCredit = payCredit;
