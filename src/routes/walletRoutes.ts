import { Router } from 'express';
import { getWallets, createWallet, updateWallet, deleteWallet, reorderWallets } from '../controllers/walletController';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', getWallets);
router.post('/', createWallet);
router.post('/reorder', reorderWallets);
router.put('/:id', updateWallet);
router.delete('/:id', deleteWallet);

export default router;
