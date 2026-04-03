import { Router } from 'express';
import { getSubscriptions, createSubscription, updateSubscription, deleteSubscription, paySubscription } from '../controllers/subscriptionController';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', getSubscriptions);
router.post('/', createSubscription);
router.put('/:id', updateSubscription);
router.post('/:id/pay', paySubscription);
router.delete('/:id', deleteSubscription);

export default router;
