import { Router } from 'express';
import { 
  getBudgetPeriods, 
  createBudgetPeriod, 
  updateBudgetPeriod, 
  deleteBudgetPeriod, 
  getPeriodAnalytics,
  cloneBudgetPeriod
} from '../controllers/budgetPeriodController';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', getBudgetPeriods);
router.post('/', createBudgetPeriod);
router.patch('/:id', updateBudgetPeriod);
router.delete('/:id', deleteBudgetPeriod);
router.get('/:id/analytics', getPeriodAnalytics);
router.post('/:id/clone', cloneBudgetPeriod);

export default router;
