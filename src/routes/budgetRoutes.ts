import { Router } from 'express';
import { getBudgets, createBudget, deleteBudget } from '../controllers/budgetController';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', getBudgets);
router.post('/', createBudget);
router.delete('/:id', deleteBudget);

export default router;
