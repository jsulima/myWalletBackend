"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTransaction = exports.deleteTransaction = exports.createTransaction = exports.getTransactions = void 0;
const db_1 = require("../utils/db");
const zod_1 = require("zod");
const transactionSchema = zod_1.z.object({
    walletId: zod_1.z.string().uuid(),
    targetWalletId: zod_1.z.string().uuid().optional(),
    categoryId: zod_1.z.string().uuid(),
    amount: zod_1.z.number().positive(),
    targetAmount: zod_1.z.number().positive().optional(),
    type: zod_1.z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
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
                ? {
                    OR: [
                        { walletId: String(walletId) },
                        { targetWalletId: String(walletId) }
                    ]
                }
                : {
                    OR: [
                        { wallet: { userId: req.userId } },
                        { AND: [{ targetWalletId: { not: null } }, { targetWallet: { userId: req.userId } }] }
                    ]
                },
            select: {
                id: true,
                walletId: true,
                targetWalletId: true,
                categoryId: true,
                transferId: true,
                amount: true,
                targetAmount: true,
                type: true,
                date: true,
                description: true,
                category: true,
                wallet: {
                    select: {
                        id: true,
                        name: true,
                        currency: true,
                        balance: true,
                    }
                },
                targetWallet: {
                    select: {
                        id: true,
                        name: true,
                        currency: true,
                        balance: true,
                    }
                },
            },
            orderBy: [
                { date: 'desc' },
                { createdAt: 'desc' }
            ],
        });
        res.json(transactions);
    }
    catch (error) {
        console.error('Error in getTransactions:', error);
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
        if (data.type === 'TRANSFER') {
            if (!data.targetWalletId || !data.targetAmount) {
                res.status(400).json({ error: 'Target wallet and target amount are required for transfers' });
                return;
            }
            const targetWallet = await db_1.prisma.wallet.findUnique({ where: { id: data.targetWalletId } });
            if (!targetWallet || targetWallet.userId !== req.userId) {
                res.status(403).json({ error: 'Access denied to target wallet' });
                return;
            }
        }
        // Use Prisma transaction to ensure atomicity
        const result = await db_1.prisma.$transaction(async (tx) => {
            const transaction = await tx.transaction.create({
                data: {
                    ...data,
                    date: data.date ? new Date(data.date) : undefined,
                },
            });
            if (data.type === 'TRANSFER') {
                // Source wallet (Expense side)
                await tx.wallet.update({
                    where: { id: data.walletId },
                    data: { balance: { decrement: data.amount } },
                });
                // Target wallet (Income side)
                await tx.wallet.update({
                    where: { id: data.targetWalletId },
                    data: { balance: { increment: data.targetAmount } },
                });
            }
            else {
                const balanceChange = data.type === 'INCOME' ? data.amount : -data.amount;
                await tx.wallet.update({
                    where: { id: data.walletId },
                    data: { balance: { increment: balanceChange } },
                });
            }
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
            if (transaction.type === 'TRANSFER') {
                // Revert source (was decrement, so increment back)
                await tx.wallet.update({
                    where: { id: transaction.walletId },
                    data: { balance: { increment: transaction.amount } },
                });
                // Revert target (was increment, so decrement back)
                if (transaction.targetWalletId) {
                    await tx.wallet.update({
                        where: { id: transaction.targetWalletId },
                        data: { balance: { decrement: transaction.targetAmount } },
                    });
                }
            }
            else {
                const balanceRevert = transaction.type === 'INCOME' ? -transaction.amount : transaction.amount;
                await tx.wallet.update({
                    where: { id: transaction.walletId },
                    data: { balance: { increment: balanceRevert } },
                });
            }
        });
        res.json({ message: 'Transaction deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete transaction' });
    }
};
exports.deleteTransaction = deleteTransaction;
const updateTransaction = async (req, res) => {
    try {
        const id = String(req.params.id);
        console.log(`Updating transaction ${id} for user ${req.userId}`);
        const data = transactionSchema.parse(req.body);
        const oldTransaction = await db_1.prisma.transaction.findUnique({
            where: { id },
            include: { wallet: true },
        });
        if (!oldTransaction) {
            console.log(`Transaction ${id} not found`);
        }
        else if (oldTransaction.wallet.userId !== req.userId) {
            console.log(`Access denied for transaction ${id}. Owner: ${oldTransaction.wallet.userId}, Req: ${req.userId}`);
        }
        if (!oldTransaction || oldTransaction.wallet.userId !== req.userId) {
            res.status(404).json({ error: 'Transaction not found or access denied' });
            return;
        }
        // Verify ownership of the new wallet
        const newWallet = await db_1.prisma.wallet.findUnique({ where: { id: data.walletId } });
        if (!newWallet || newWallet.userId !== req.userId) {
            res.status(403).json({ error: 'Access denied to the new wallet' });
            return;
        }
        const result = await db_1.prisma.$transaction(async (tx) => {
            // 1. Reverse old transaction effect
            if (oldTransaction.type === 'TRANSFER') {
                await tx.wallet.update({
                    where: { id: oldTransaction.walletId },
                    data: { balance: { increment: oldTransaction.amount } },
                });
                if (oldTransaction.targetWalletId) {
                    await tx.wallet.update({
                        where: { id: oldTransaction.targetWalletId },
                        data: { balance: { decrement: oldTransaction.targetAmount } },
                    });
                }
            }
            else {
                const oldBalanceRevert = oldTransaction.type === 'INCOME' ? -oldTransaction.amount : oldTransaction.amount;
                await tx.wallet.update({
                    where: { id: oldTransaction.walletId },
                    data: { balance: { increment: oldBalanceRevert } },
                });
            }
            // 2. Apply new transaction effect
            if (data.type === 'TRANSFER') {
                // Source wallet (Expense side)
                await tx.wallet.update({
                    where: { id: data.walletId },
                    data: { balance: { decrement: data.amount } },
                });
                // Target wallet (Income side)
                if (data.targetWalletId && data.targetAmount) {
                    await tx.wallet.update({
                        where: { id: data.targetWalletId },
                        data: { balance: { increment: data.targetAmount } },
                    });
                }
            }
            else {
                const newBalanceChange = data.type === 'INCOME' ? data.amount : -data.amount;
                await tx.wallet.update({
                    where: { id: data.walletId },
                    data: { balance: { increment: newBalanceChange } },
                });
            }
            // 3. Update transaction record
            const updated = await tx.transaction.update({
                where: { id },
                data: {
                    ...data,
                    date: data.date ? new Date(data.date) : undefined,
                },
            });
            return updated;
        });
        res.json(result);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
        }
        else {
            res.status(500).json({ error: 'Failed to update transaction' });
        }
    }
};
exports.updateTransaction = updateTransaction;
