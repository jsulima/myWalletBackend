import { Router } from 'express';
import { getCredits, createCredit, updateCredit, deleteCredit } from '../controllers/creditController';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', getCredits);
router.post('/', createCredit);
router.put('/:id', updateCredit);
router.delete('/:id', deleteCredit);

export default router;
