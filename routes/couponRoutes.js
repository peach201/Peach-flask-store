import express from 'express';
import {
    createCoupon,
    getActiveCoupons,
    validateCoupon,
    updateCoupon,
    deleteCoupon,
    getAllCoupons
} from '../controllers/couponController.js';
import { protect, admin } from '../middlewares/auth.js';

const router = express.Router();

router.post('/', protect, admin, createCoupon);
router.get('/all', protect, admin, getAllCoupons);
router.get('/', getActiveCoupons);
router.post('/validate', protect, validateCoupon);
router.put('/:code', protect, admin, updateCoupon);
router.delete('/:code', protect, admin, deleteCoupon);

export default router;