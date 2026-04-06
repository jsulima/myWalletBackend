"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paySubscription = exports.deleteSubscription = exports.updateSubscription = exports.createSubscription = exports.getSubscriptions = void 0;
const db_1 = require("../utils/db");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const currencyService_1 = require("../services/currencyService");
const subscriptionSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    amount: zod_1.z.number().positive(),
    currency: zod_1.z.string().optional().default('USD'),
    frequency: zod_1.z.nativeEnum(client_1.SubscriptionFrequency).optional().default(client_1.SubscriptionFrequency.MONTHLY),
    status: zod_1.z.nativeEnum(client_1.SubscriptionStatus).optional().default(client_1.SubscriptionStatus.ACTIVE),
    startDate: zod_1.z.string().datetime().optional(),
    categoryId: zod_1.z.string().uuid().optional().nullable(),
    walletId: zod_1.z.string().uuid(),
    note: zod_1.z.string().optional().nullable(),
});
const getSubscriptions = async (req, res) => {
    try {
        const subscriptions = await db_1.prisma.subscription.findMany({
            where: { userId: req.userId },
            include: {
                category: true,
                wallet: true
            },
            orderBy: { nextPaymentDate: 'asc' },
        });
        res.json(subscriptions);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }
};
exports.getSubscriptions = getSubscriptions;
const createSubscription = async (req, res) => {
    try {
        const data = subscriptionSchema.parse(req.body);
        const startDate = data.startDate ? new Date(data.startDate) : new Date();
        // Calculate Next Payment Date
        const nextPaymentDate = calculateNextPaymentDate(startDate, data.frequency || client_1.SubscriptionFrequency.MONTHLY);
        // Check if we should pay now (if startDate is today or in the past)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isInitialPayment = startDate <= today;
        const result = await db_1.prisma.$transaction(async (tx) => {
            // 1. Create the subscription
            const subscription = await tx.subscription.create({
                data: {
                    name: data.name,
                    amount: data.amount,
                    currency: data.currency,
                    frequency: data.frequency || client_1.SubscriptionFrequency.MONTHLY,
                    status: data.status || client_1.SubscriptionStatus.ACTIVE,
                    startDate,
                    nextPaymentDate: isInitialPayment ? calculateNextPaymentDate(nextPaymentDate, data.frequency || client_1.SubscriptionFrequency.MONTHLY) : nextPaymentDate,
                    categoryId: data.categoryId,
                    walletId: data.walletId,
                    note: data.note,
                    userId: req.userId,
                },
            });
            // 2. If initial payment, create a transaction
            if (isInitialPayment) {
                const wallet = await tx.wallet.findUnique({ where: { id: data.walletId } });
                const { convertedAmount, rate } = await (0, currencyService_1.convertAmount)(data.amount, data.currency, wallet.currency);
                const description = data.currency !== wallet.currency
                    ? `Subscription: ${data.name} (${data.amount} ${data.currency} at rate ${rate.toFixed(2)})`
                    : `Subscription: ${data.name}`;
                await tx.transaction.create({
                    data: {
                        walletId: data.walletId,
                        categoryId: data.categoryId || (await getDefaultCategoryId(req.userId)),
                        amount: convertedAmount,
                        type: 'EXPENSE',
                        description,
                        date: startDate,
                    }
                });
                // 3. Update wallet balance
                await tx.wallet.update({
                    where: { id: data.walletId },
                    data: { balance: { decrement: convertedAmount } }
                });
            }
            return subscription;
        });
        res.status(201).json(result);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
        }
        else {
            console.error(error);
            res.status(500).json({ error: 'Failed to create subscription' });
        }
    }
};
exports.createSubscription = createSubscription;
const updateSubscription = async (req, res) => {
    try {
        const id = String(req.params.id);
        const data = subscriptionSchema.partial().parse(req.body);
        const existing = await db_1.prisma.subscription.findUnique({ where: { id } });
        if (!existing || existing.userId !== req.userId)
            return res.status(404).json({ error: 'Not found' });
        let nextPaymentDate = existing.nextPaymentDate;
        if (data.frequency || data.startDate) {
            const start = data.startDate ? new Date(data.startDate) : existing.startDate;
            const freq = data.frequency || existing.frequency;
            nextPaymentDate = calculateNextPaymentDate(start, freq);
        }
        const updated = await db_1.prisma.subscription.update({
            where: { id },
            data: {
                ...data,
                startDate: data.startDate ? new Date(data.startDate) : undefined,
                nextPaymentDate,
            },
        });
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
};
exports.updateSubscription = updateSubscription;
const deleteSubscription = async (req, res) => {
    try {
        const id = String(req.params.id);
        const subscription = await db_1.prisma.subscription.findUnique({ where: { id } });
        if (!subscription || subscription.userId !== req.userId)
            return res.status(404).json({ error: 'Not found' });
        await db_1.prisma.subscription.delete({ where: { id } });
        res.json({ message: 'Deleted' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
};
exports.deleteSubscription = deleteSubscription;
const paySubscription = async (req, res) => {
    try {
        const id = String(req.params.id);
        const subscription = await db_1.prisma.subscription.findUnique({
            where: { id },
            include: { wallet: true }
        });
        if (!subscription || subscription.userId !== req.userId)
            return res.status(404).json({ error: 'Not found' });
        if (subscription.status !== client_1.SubscriptionStatus.ACTIVE)
            return res.status(400).json({ error: 'Subscription is not active' });
        const result = await db_1.prisma.$transaction(async (tx) => {
            const { convertedAmount, rate } = await (0, currencyService_1.convertAmount)(subscription.amount, subscription.currency, subscription.wallet.currency);
            const description = subscription.currency !== subscription.wallet.currency
                ? `Subscription: ${subscription.name} (${subscription.amount} ${subscription.currency} at rate ${rate.toFixed(2)})`
                : `Subscription: ${subscription.name}`;
            // 1. Create Transaction
            await tx.transaction.create({
                data: {
                    walletId: subscription.walletId,
                    categoryId: subscription.categoryId || (await getDefaultCategoryId(req.userId)),
                    amount: convertedAmount,
                    type: 'EXPENSE',
                    description,
                    date: new Date(),
                }
            });
            // 2. Update Wallet Balance
            await tx.wallet.update({
                where: { id: subscription.walletId },
                data: { balance: { decrement: convertedAmount } }
            });
            // 3. Update Next Payment Date
            const nextDate = calculateNextPaymentDate(new Date(subscription.nextPaymentDate), subscription.frequency);
            const updated = await tx.subscription.update({
                where: { id },
                data: { nextPaymentDate: nextDate }
            });
            return updated;
        });
        res.json(result);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to pay subscription' });
    }
};
exports.paySubscription = paySubscription;
async function getDefaultCategoryId(userId) {
    const category = await db_1.prisma.category.findFirst({
        where: { userId, type: 'EXPENSE' },
        orderBy: { createdAt: 'asc' }
    });
    return category?.id || '';
}
function calculateNextPaymentDate(startDate, frequency) {
    const next = new Date(startDate);
    const today = new Date();
    // Set to start of day for comparison
    today.setHours(0, 0, 0, 0);
    // If start date is in the future, that's the next payment date
    if (next > today)
        return next;
    // Otherwise, find the next occurrence from today
    // We want the FIRST date that is TODAY or in the FUTURE
    while (next < today) {
        switch (frequency) {
            case client_1.SubscriptionFrequency.DAILY:
                next.setDate(next.getDate() + 1);
                break;
            case client_1.SubscriptionFrequency.WEEKLY:
                next.setDate(next.getDate() + 7);
                break;
            case client_1.SubscriptionFrequency.MONTHLY:
                next.setMonth(next.getMonth() + 1);
                break;
            case client_1.SubscriptionFrequency.YEARLY:
                next.setFullYear(next.getFullYear() + 1);
                break;
        }
    }
    return next;
}
