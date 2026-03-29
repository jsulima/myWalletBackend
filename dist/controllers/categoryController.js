"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCategory = exports.updateCategory = exports.createCategory = exports.getCategories = void 0;
const db_1 = require("../utils/db");
const zod_1 = require("zod");
const categorySchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    type: zod_1.z.enum(['INCOME', 'EXPENSE']),
    color: zod_1.z.string().optional(),
    icon: zod_1.z.string().optional(),
});
const getCategories = async (req, res) => {
    try {
        const categories = await db_1.prisma.category.findMany({
            where: {
                OR: [
                    { userId: null },
                    { userId: req.userId },
                ],
            },
            orderBy: {
                createdAt: 'asc',
            },
        });
        res.json(categories);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
};
exports.getCategories = getCategories;
const createCategory = async (req, res) => {
    try {
        const { name, type, color, icon } = categorySchema.parse(req.body);
        const category = await db_1.prisma.category.create({
            data: {
                name,
                type,
                color: color ?? '#6b7280',
                icon: icon ?? 'Tag',
                userId: req.userId,
            },
        });
        res.status(201).json(category);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
        }
        else {
            res.status(500).json({ error: 'Failed to create category' });
        }
    }
};
exports.createCategory = createCategory;
const updateCategory = async (req, res) => {
    try {
        const id = String(req.params.id);
        const { name, type, color, icon } = categorySchema.partial().parse(req.body);
        const category = await db_1.prisma.category.findUnique({ where: { id } });
        if (!category) {
            res.status(404).json({ error: 'Category not found' });
            return;
        }
        if (category.userId !== req.userId) {
            // Cannot edit system categories or other users' categories
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        const updated = await db_1.prisma.category.update({
            where: { id },
            data: { name, type, color, icon },
        });
        res.json(updated);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
        }
        else {
            res.status(500).json({ error: 'Failed to update category' });
        }
    }
};
exports.updateCategory = updateCategory;
const deleteCategory = async (req, res) => {
    try {
        const id = String(req.params.id);
        const category = await db_1.prisma.category.findUnique({ where: { id } });
        if (!category) {
            res.status(404).json({ error: 'Category not found' });
            return;
        }
        if (category.userId !== req.userId) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        await db_1.prisma.category.delete({ where: { id } });
        res.json({ message: 'Category deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete category' });
    }
};
exports.deleteCategory = deleteCategory;
