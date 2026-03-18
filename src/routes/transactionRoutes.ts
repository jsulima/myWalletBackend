import { Router } from 'express';
import { getTransactions, createTransaction, deleteTransaction, updateTransaction } from '../controllers/transactionController';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', getTransactions);
router.post('/', createTransaction);
router.put('/:id', updateTransaction);
router.delete('/:id', deleteTransaction);

export default router;
