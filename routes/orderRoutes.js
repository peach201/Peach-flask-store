import express from 'express';
import {
    orderController
} from '../controllers/orderController.js';
import { protect, admin, optionalAuth } from '../middlewares/auth.js';

const router = express.Router();

router.post('/', optionalAuth, orderController.createOrder);
router.get('/my-orders', protect, orderController.getUserOrders);
router.get('/', protect, admin, orderController.getAllOrders);
router.get('/sales', protect, admin, orderController.getSalesStats);
router.get('/:id', protect, orderController.getOrderById);
router.put('/:id/status', protect, admin, orderController.updateOrderStatus);
router.post('/notify', orderController.handlePayfastNotification);

// router.post('/create-payment-intent', protect, createPaymentIntent);

export default router;