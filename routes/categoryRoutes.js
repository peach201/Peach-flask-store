import express from 'express';
import {
    createCategory,
    getCategories,
    getCategoryById,
    updateCategory,
    deleteCategory,
} from '../controllers/categoryController.js';
import { protect, admin } from '../middlewares/auth.js';

const router = express.Router();

router.post('/', protect, admin, createCategory);
router.get('/', getCategories);
router.get('/:id', getCategoryById);
router.put('/:id', protect, admin, updateCategory);
router.delete('/:id', protect, admin, deleteCategory);

export default router;
