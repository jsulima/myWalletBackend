"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSubscription = exports.updateSubscription = exports.createSubscription = exports.getSubscriptions = void 0;
const db_1 = require("../utils/db");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const subscriptionSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    amount: zod_1.z.number().positive(),
    currency: zod_1.z.string().optional().default('USD'),
    frequency: zod_1.z.nativeEnum(client_1.SubscriptionFrequency).optional().default(client_1.SubscriptionFrequency.MONTHLY),
    status: zod_1.z.nativeEnum(client_1.SubscriptionStatus).optional().default(client_1.SubscriptionStatus.ACTIVE),
    startDate: zod_1.z.string().datetime().optional(),
    categoryId: zod_1.z.string().uuid().optional().nullable(),
    note: zod_1.z.string().optional().nullable(),
});
const getSubscriptions = async (req, res) => {
    try {
        const subscriptions = await db_1.prisma.subscription.findMany({
            where: { userId: req.userId },
            include: { category: true },
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
        const subscription = await db_1.prisma.subscription.create({
            data: {
                name: data.name,
                amount: data.amount,
                currency: data.currency,
                frequency: data.frequency || client_1.SubscriptionFrequency.MONTHLY,
                status: data.status || client_1.SubscriptionStatus.ACTIVE,
                startDate,
                nextPaymentDate,
                categoryId: data.categoryId,
                note: data.note,
                userId: req.userId,
            },
        });
        res.status(201).json(subscription);
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
