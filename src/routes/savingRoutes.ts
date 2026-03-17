import { Router } from 'express';
import { getSavings, createSaving, updateSaving, deleteSaving } from '../controllers/savingController';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', getSavings);
router.post('/', createSaving);
router.put('/:id', updateSaving);
router.delete('/:id', deleteSaving);

export default router;
