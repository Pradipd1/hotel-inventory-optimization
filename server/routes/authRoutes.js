import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, changePasswordSchema } from '../validators/authValidators.js';
import * as auth from '../controllers/authController.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : 20,
  // Only failed attempts count, so staff sharing one hotel IP are not locked out by normal sign-ins.
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
});

router.post('/login', loginLimiter, validate({ body: loginSchema }), auth.login);
router.get('/me', authenticate, auth.me);
router.post('/logout', authenticate, auth.logout);
router.put('/password', authenticate, validate({ body: changePasswordSchema }), auth.changePassword);

export default router;
