import { Router } from 'express';
import { createTransfer, getTransfers } from '../controllers/transferController';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

router.use(authenticate);

router.post('/', createTransfer);
router.get('/', getTransfers);

export default router;
