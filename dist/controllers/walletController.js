"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteWallet = exports.updateWallet = exports.createWallet = exports.getWallets = void 0;
const db_1 = require("../utils/db");
const zod_1 = require("zod");
const walletSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    balance: zod_1.z.number().optional(),
    currency: zod_1.z.string().optional(),
});
const getWallets = async (req, res) => {
    try {
        const wallets = await db_1.prisma.wallet.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
        });
        res.json(wallets);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch wallets' });
    }
};
exports.getWallets = getWallets;
const createWallet = async (req, res) => {
    try {
        const { name, balance, currency } = walletSchema.parse(req.body);
        const wallet = await db_1.prisma.wallet.create({
            data: {
                userId: req.userId,
                name,
                balance: balance ?? 0,
                currency: currency ?? 'USD',
            },
        });
        res.status(201).json(wallet);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
        }
        else {
            res.status(500).json({ error: 'Failed to create wallet' });
        }
    }
};
exports.createWallet = createWallet;
const updateWallet = async (req, res) => {
    try {
        const id = String(req.params.id);
        const data = walletSchema.partial().parse(req.body);
        const wallet = await db_1.prisma.wallet.findUnique({ where: { id } });
        if (!wallet || wallet.userId !== req.userId) {
            res.status(404).json({ error: 'Wallet not found' });
            return;
        }
        const updated = await db_1.prisma.wallet.update({
            where: { id },
            data,
        });
        res.json(updated);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
        }
        else {
            res.status(500).json({ error: 'Failed to update wallet' });
        }
    }
};
exports.updateWallet = updateWallet;
const deleteWallet = async (req, res) => {
    try {
        const id = String(req.params.id);
        const wallet = await db_1.prisma.wallet.findUnique({ where: { id } });
        if (!wallet || wallet.userId !== req.userId) {
            res.status(404).json({ error: 'Wallet not found' });
            return;
        }
        await db_1.prisma.wallet.delete({ where: { id } });
        res.json({ message: 'Wallet deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete wallet' });
    }
};
exports.deleteWallet = deleteWallet;
