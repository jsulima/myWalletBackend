import { Router } from 'express';
import { register, login, getMe, updateProfile } from '../controllers/authController';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, getMe);
router.patch('/profile', authenticate, updateProfile);

export default router;
