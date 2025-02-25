import express from 'express';
import {
    signup,
    login,
    logout,
    verifyEmail,
    forgotPassword,
    resetPassword,
    resendVerificationEmail,
    refreshToken,
    getMe
} from '../controllers/authController.js';
import { protect } from '../middlewares/auth.js';

const router = express.Router();

// Authentication routes
router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerificationEmail);

// Password management
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

// Token management
router.post('/refresh-token', refreshToken);

// User profile
router.get('/me', protect, getMe);

export default router;