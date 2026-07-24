import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { getPlannedExpenses, createPlannedExpense, updatePlannedExpense, deletePlannedExpense } from '../controllers/plannedExpenseController';

const router = Router();

router.use(authenticate);

router.get('/', getPlannedExpenses);
router.post('/', createPlannedExpense);
router.put('/:id', updatePlannedExpense);
router.delete('/:id', deletePlannedExpense);

export default router;
