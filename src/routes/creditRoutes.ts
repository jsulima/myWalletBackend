import { Router } from 'express';
import { getCredits, createCredit, updateCredit, deleteCredit, payCredit } from '../controllers/creditController';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', getCredits);
router.post('/', createCredit);
router.put('/:id', updateCredit);
router.delete('/:id', deleteCredit);
router.post('/:id/pay', payCredit);

export default router;
