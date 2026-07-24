"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paySubscription = exports.deleteSubscription = exports.updateSubscription = exports.createSubscription = exports.getSubscriptions = void 0;
exports.recalculateSubscriptionNextPaymentDate = recalculateSubscriptionNextPaymentDate;
exports.calculateNextPaymentDate = calculateNextPaymentDate;
const db_1 = require("../utils/db");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const currencyService_1 = require("../services/currencyService");
const subscriptionSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    amount: zod_1.z.number().positive(),
    currency: zod_1.z.string().optional(),
    frequency: zod_1.z.nativeEnum(client_1.SubscriptionFrequency).optional().default(client_1.SubscriptionFrequency.MONTHLY),
    status: zod_1.z.nativeEnum(client_1.SubscriptionStatus).optional().default(client_1.SubscriptionStatus.ACTIVE),
    startDate: zod_1.z.string().datetime().optional(),
    nextPaymentDate: zod_1.z.string().datetime().optional().nullable(),
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
        // SELF-HEALING: Check and repair stale subscriptions (due today or in the past)
        // This addresses "current user situations" by syncing with transaction history on the fly.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const staleSubs = subscriptions.filter(sub => {
            const nextDate = new Date(sub.nextPaymentDate);
            nextDate.setHours(0, 0, 0, 0);
            return nextDate <= today;
        });
        if (staleSubs.length > 0) {
            await Promise.all(staleSubs.map(sub => recalculateSubscriptionNextPaymentDate(db_1.prisma, sub.id)));
            // Refetch subscriptions after repair to return accurate data
            const updatedSubscriptions = await db_1.prisma.subscription.findMany({
                where: { userId: req.userId },
                include: {
                    category: true,
                    wallet: true
                },
                orderBy: { nextPaymentDate: 'asc' },
            });
            return res.json(updatedSubscriptions);
        }
        res.json(subscriptions);
    }
    catch (error) {
        console.error('Error fetching subscriptions:', error);
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
                    nextPaymentDate: nextPaymentDate,
                    categoryId: data.categoryId,
                    walletId: data.walletId,
                    note: data.note,
                    userId: req.userId,
                },
            });
            // 2. If initial payment, create a transaction and then sync the date
            if (isInitialPayment) {
                const wallet = await tx.wallet.findUnique({ where: { id: data.walletId } });
                if (!wallet)
                    throw new Error('Wallet not found');
                const subscriptionCurrency = subscription.currency || 'USD';
                const { convertedAmount, rate } = await (0, currencyService_1.convertAmount)(data.amount, subscriptionCurrency, wallet.currency);
                const description = subscriptionCurrency !== wallet.currency
                    ? `Subscription: ${data.name} (${data.amount} ${subscriptionCurrency} at rate ${rate.toFixed(2)})`
                    : `Subscription: ${data.name}`;
                await tx.transaction.create({
                    data: {
                        walletId: data.walletId,
                        categoryId: data.categoryId || (await getDefaultCategoryId(req.userId)),
                        subscriptionId: subscription.id,
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
                // 4. Sync Next Payment Date based on the transaction we just created
                await recalculateSubscriptionNextPaymentDate(tx, subscription.id);
            }
            const refreshed = await tx.subscription.findUnique({ where: { id: subscription.id } });
            return refreshed;
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
        // 1. If manual nextPaymentDate provided, prioritize it
        if (data.nextPaymentDate) {
            nextPaymentDate = new Date(data.nextPaymentDate);
        }
        // 2. Otherwise, if frequency or startDate changed, recalculate
        else if (data.frequency || data.startDate) {
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
        console.error('Error updating subscription:', error);
        res.status(500).json({ error: 'Failed to update subscription' });
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
                    subscriptionId: id,
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
            await recalculateSubscriptionNextPaymentDate(tx, id);
            const updated = await tx.subscription.findUnique({ where: { id } });
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
async function recalculateSubscriptionNextPaymentDate(tx, subscriptionId) {
    const sub = await tx.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub)
        return;
    // Find the latest transaction for this subscription
    const latestTransaction = await tx.transaction.findFirst({
        where: { subscriptionId: subscriptionId },
        orderBy: { date: 'desc' }
    });
    let baseDate = sub.startDate;
    let inclusive = true;
    if (latestTransaction) {
        baseDate = latestTransaction.date;
        inclusive = false; // We want the next one after the latest payment
    }
    const nextDate = calculateNextPaymentDate(baseDate, sub.frequency, inclusive);
    return await tx.subscription.update({
        where: { id: subscriptionId },
        data: { nextPaymentDate: nextDate }
    });
}
function calculateNextPaymentDate(startDate, frequency, inclusive = true) {
    const next = new Date(startDate);
    next.setHours(0, 0, 0, 0); // Normalize to start of day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // If inclusive is true, we want the FIRST date that is TODAY or in the FUTURE
    // If inclusive is false, we want the FIRST date that is STRICTLY in the FUTURE
    if (inclusive) {
        if (next >= today)
            return next;
    }
    else {
        if (next > today)
            return next;
    }
    while (inclusive ? next < today : next <= today) {
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
