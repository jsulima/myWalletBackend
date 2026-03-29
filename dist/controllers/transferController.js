"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTransfers = exports.createTransfer = void 0;
const db_1 = require("../utils/db");
const zod_1 = require("zod");
const transferSchema = zod_1.z.object({
    sourceWalletId: zod_1.z.string().uuid(),
    targetWalletId: zod_1.z.string().uuid(),
    sourceAmount: zod_1.z.number().positive(),
    targetAmount: zod_1.z.number().positive(),
    exchangeRate: zod_1.z.number().positive().default(1),
    categoryId: zod_1.z.string().uuid(), // Category for the transactions
    description: zod_1.z.string().optional(),
    date: zod_1.z.string().datetime().optional(),
});
const createTransfer = async (req, res) => {
    try {
        const data = transferSchema.parse(req.body);
        if (data.sourceWalletId === data.targetWalletId) {
            res.status(400).json({ error: 'Source and target wallets must be different' });
            return;
        }
        // Verify ownership of both wallets
        const sourceWallet = await db_1.prisma.wallet.findUnique({ where: { id: data.sourceWalletId } });
        const targetWallet = await db_1.prisma.wallet.findUnique({ where: { id: data.targetWalletId } });
        if (!sourceWallet || sourceWallet.userId !== req.userId) {
            res.status(403).json({ error: 'Access denied to source wallet' });
            return;
        }
        if (!targetWallet || targetWallet.userId !== req.userId) {
            res.status(403).json({ error: 'Access denied to target wallet' });
            return;
        }
        // Atomic Transfer
        const result = await db_1.prisma.$transaction(async (tx) => {
            // 1. Create Transfer record
            const transfer = await tx.transfer.create({
                data: {
                    sourceWalletId: data.sourceWalletId,
                    targetWalletId: data.targetWalletId,
                    sourceAmount: data.sourceAmount,
                    targetAmount: data.targetAmount,
                    exchangeRate: data.exchangeRate,
                    description: data.description,
                    date: data.date ? new Date(data.date) : undefined,
                },
            });
            // 2. Create EXPENSE transaction for source wallet
            await tx.transaction.create({
                data: {
                    walletId: data.sourceWalletId,
                    categoryId: data.categoryId,
                    transferId: transfer.id,
                    amount: data.sourceAmount,
                    type: 'EXPENSE',
                    description: data.description || `Transfer to ${targetWallet.name}`,
                    date: data.date ? new Date(data.date) : undefined,
                },
            });
            // 3. Create INCOME transaction for target wallet
            await tx.transaction.create({
                data: {
                    walletId: data.targetWalletId,
                    categoryId: data.categoryId,
                    transferId: transfer.id,
                    amount: data.targetAmount,
                    type: 'INCOME',
                    description: data.description || `Transfer from ${sourceWallet.name}`,
                    date: data.date ? new Date(data.date) : undefined,
                },
            });
            // 4. Update source wallet balance
            await tx.wallet.update({
                where: { id: data.sourceWalletId },
                data: { balance: { decrement: data.sourceAmount } },
            });
            // 5. Update target wallet balance
            await tx.wallet.update({
                where: { id: data.targetWalletId },
                data: { balance: { increment: data.targetAmount } },
            });
            return transfer;
        });
        res.status(201).json(result);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
        }
        else {
            console.error('Transfer failed:', error);
            res.status(500).json({ error: 'Failed to create transfer' });
        }
    }
};
exports.createTransfer = createTransfer;
const getTransfers = async (req, res) => {
    try {
        const transfers = await db_1.prisma.transfer.findMany({
            where: {
                OR: [
                    { sourceWalletId: { in: (await db_1.prisma.wallet.findMany({ where: { userId: req.userId }, select: { id: true } })).map(w => w.id) } },
                    { targetWalletId: { in: (await db_1.prisma.wallet.findMany({ where: { userId: req.userId }, select: { id: true } })).map(w => w.id) } }
                ]
            },
            orderBy: { date: 'desc' },
        });
        res.json(transfers);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch transfers' });
    }
};
exports.getTransfers = getTransfers;
