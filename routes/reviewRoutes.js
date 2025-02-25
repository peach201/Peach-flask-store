import express from 'express';
import {
    createReview,
    getProductReviews,
    getAllReviews,
    updateReview,
    deleteReview
} from '../controllers/reviewController.js';
import { admin, protect } from '../middlewares/auth.js';
import { upload } from '../config/cloudinary.js';

const router = express.Router();

router.post('/', protect, upload, createReview);
router.get('/allReviews', protect, admin, getAllReviews);
router.get('/:productId', getProductReviews);
router.put('/:id', protect,admin, updateReview);
router.delete('/:id', protect, deleteReview);

export default router;