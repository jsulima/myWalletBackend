import { Response } from 'express';
import { prisma } from '../utils/db';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware';

const categorySchema = z.object({
  name: z.string().min(1),
  type: z.enum(['INCOME', 'EXPENSE']),
  color: z.string().optional(),
  icon: z.string().optional(),
});

export const getCategories = async (req: AuthRequest, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      where: {
        OR: [
          { userId: null },
          { userId: req.userId },
        ],
      },
      orderBy: [
        { userId: 'desc' }, // User categories first or nulls first, Prisma ordering allows doing this simply. Better to just sort by createdAt
        { createdAt: 'desc' }
      ]
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

export const createCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, color, icon } = categorySchema.parse(req.body);
    const category = await prisma.category.create({
      data: {
        name,
        type,
        color: color ?? '#6b7280',
        icon: icon ?? 'Tag',
        userId: req.userId!,
      },
    });
    res.status(201).json(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      res.status(500).json({ error: 'Failed to create category' });
    }
  }
};

export const updateCategory = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, type } = categorySchema.partial().parse(req.body);

    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    if (category.userId !== req.userId) {
       // Cannot edit system categories or other users' categories
       res.status(403).json({ error: 'Forbidden' });
       return;
    }

    const updated = await prisma.category.update({
      where: { id },
      data: { name, type },
    });
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
       res.status(400).json({ error: error.issues });
    } else {
       res.status(500).json({ error: 'Failed to update category' });
    }
  }
};

export const deleteCategory = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const category = await prisma.category.findUnique({ where: { id } });
    
    if (!category) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    if (category.userId !== req.userId) {
       res.status(403).json({ error: 'Forbidden' });
       return;
    }

    await prisma.category.delete({ where: { id } });
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
};
