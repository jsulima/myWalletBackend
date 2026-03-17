"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTransaction = exports.createTransaction = exports.getTransactions = void 0;
const db_1 = require("../utils/db");
const zod_1 = require("zod");
const transactionSchema = zod_1.z.object({
    walletId: zod_1.z.string().uuid(),
    categoryId: zod_1.z.string().uuid(),
    amount: zod_1.z.number().positive(),
    type: zod_1.z.enum(['INCOME', 'EXPENSE']),
    date: zod_1.z.string().datetime().optional(), // ISO string
    description: zod_1.z.string().optional(),
});
const getTransactions = async (req, res) => {
    try {
        const { walletId } = req.query;
        // Ensure the wallet belongs to the user if walletId is provided
        if (walletId) {
            const wallet = await db_1.prisma.wallet.findUnique({ where: { id: String(walletId) } });
            if (!wallet || wallet.userId !== req.userId) {
                res.status(403).json({ error: 'Access denied to this wallet' });
                return;
            }
        }
        const transactions = await db_1.prisma.transaction.findMany({
            where: walletId
                ? { walletId: String(walletId) }
                : { wallet: { userId: req.userId } },
            include: {
                category: true,
                wallet: true,
            },
            orderBy: { date: 'desc' },
        });
        res.json(transactions);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
};
exports.getTransactions = getTransactions;
const createTransaction = async (req, res) => {
    try {
        const data = transactionSchema.parse(req.body);
        // Verify wallet ownership
        const wallet = await db_1.prisma.wallet.findUnique({ where: { id: data.walletId } });
        if (!wallet || wallet.userId !== req.userId) {
            res.status(403).json({ error: 'Access denied to this wallet' });
            return;
        }
        // Use Prisma transaction to ensure atomicity
        const result = await db_1.prisma.$transaction(async (tx) => {
            const transaction = await tx.transaction.create({
                data: {
                    ...data,
                    date: data.date ? new Date(data.date) : undefined,
                },
            });
            const balanceChange = data.type === 'INCOME' ? data.amount : -data.amount;
            await tx.wallet.update({
                where: { id: data.walletId },
                data: { balance: { increment: balanceChange } },
            });
            return transaction;
        });
        res.status(201).json(result);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
        }
        else {
            res.status(500).json({ error: 'Failed to create transaction' });
        }
    }
};
exports.createTransaction = createTransaction;
const deleteTransaction = async (req, res) => {
    try {
        const id = String(req.params.id);
        const transaction = await db_1.prisma.transaction.findUnique({
            where: { id },
            include: { wallet: true },
        });
        if (!transaction || transaction.wallet.userId !== req.userId) {
            res.status(404).json({ error: 'Transaction not found or access denied' });
            return;
        }
        await db_1.prisma.$transaction(async (tx) => {
            await tx.transaction.delete({ where: { id } });
            const balanceRevert = transaction.type === 'INCOME' ? -transaction.amount : transaction.amount;
            await tx.wallet.update({
                where: { id: transaction.walletId },
                data: { balance: { increment: balanceRevert } },
            });
        });
        res.json({ message: 'Transaction deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete transaction' });
    }
};
exports.deleteTransaction = deleteTransaction;
