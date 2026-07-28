import { Router } from 'express';
import { getBudgets, createBudget, deleteBudget, updateBudget, getCategoryAnalytics } from '../controllers/budgetController';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', getBudgets);
router.post('/', createBudget);
router.put('/:id', updateBudget);
router.delete('/:id', deleteBudget);
router.get('/analytics/:categoryId', getCategoryAnalytics);

export default router;

