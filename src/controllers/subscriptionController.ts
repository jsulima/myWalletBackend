import { Response } from 'express';
import { prisma } from '../utils/db';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware';
import { SubscriptionFrequency, SubscriptionStatus } from '@prisma/client';

const subscriptionSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().optional().default('USD'),
  frequency: z.nativeEnum(SubscriptionFrequency).optional().default(SubscriptionFrequency.MONTHLY),
  status: z.nativeEnum(SubscriptionStatus).optional().default(SubscriptionStatus.ACTIVE),
  startDate: z.string().datetime().optional(),
  categoryId: z.string().uuid().optional().nullable(),
  note: z.string().optional().nullable(),
});

export const getSubscriptions = async (req: AuthRequest, res: Response) => {
  try {
    const subscriptions = await prisma.subscription.findMany({
      where: { userId: req.userId },
      include: { category: true },
      orderBy: { nextPaymentDate: 'asc' },
    });
    res.json(subscriptions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
};

export const createSubscription = async (req: AuthRequest, res: Response) => {
  try {
    const data = subscriptionSchema.parse(req.body);
    const startDate = data.startDate ? new Date(data.startDate) : new Date();
    
    // Calculate Next Payment Date
    const nextPaymentDate = calculateNextPaymentDate(startDate, data.frequency || SubscriptionFrequency.MONTHLY);

    const subscription = await prisma.subscription.create({
      data: {
        name: data.name,
        amount: data.amount,
        currency: data.currency,
        frequency: data.frequency || SubscriptionFrequency.MONTHLY,
        status: data.status || SubscriptionStatus.ACTIVE,
        startDate,
        nextPaymentDate,
        categoryId: data.categoryId,
        note: data.note,
        userId: req.userId!,
      },
    });
    res.status(201).json(subscription);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Failed to create subscription' });
    }
  }
};

export const updateSubscription = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const data = subscriptionSchema.partial().parse(req.body);
    
    const existing = await prisma.subscription.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.userId) return res.status(404).json({ error: 'Not found' });

    let nextPaymentDate = existing.nextPaymentDate;
    if (data.frequency || data.startDate) {
        const start = data.startDate ? new Date(data.startDate) : existing.startDate;
        const freq = data.frequency || existing.frequency;
        nextPaymentDate = calculateNextPaymentDate(start, freq);
    }

    const updated = await prisma.subscription.update({
      where: { id },
      data: {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        nextPaymentDate,
      },
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
};

export const deleteSubscription = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const subscription = await prisma.subscription.findUnique({ where: { id } });
    if (!subscription || subscription.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
    
    await prisma.subscription.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
};

function calculateNextPaymentDate(startDate: Date, frequency: SubscriptionFrequency): Date {
    const next = new Date(startDate);
    const today = new Date();
    
    // Set to start of day for comparison
    today.setHours(0, 0, 0, 0);
    
    // If start date is in the future, that's the next payment date
    if (next > today) return next;

    // Otherwise, find the next occurrence from today
    // We want the FIRST date that is TODAY or in the FUTURE
    while (next < today) {
        switch (frequency) {
            case SubscriptionFrequency.DAILY:
                next.setDate(next.getDate() + 1);
                break;
            case SubscriptionFrequency.WEEKLY:
                next.setDate(next.getDate() + 7);
                break;
            case SubscriptionFrequency.MONTHLY:
                next.setMonth(next.getMonth() + 1);
                break;
            case SubscriptionFrequency.YEARLY:
                next.setFullYear(next.getFullYear() + 1);
                break;
        }
    }
    return next;
}
