import express from 'express';
import {
    getUserProfile,
    updateProfile,
    getAllUsers,
    getUserById,
    getUserAddresses,
    addAddress,
    updateAddress,
    deleteAddress,
    deleteUserAccount
} from '../controllers/userController.js';
import { protect, admin } from '../middlewares/auth.js';

const router = express.Router();

router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateProfile);
router.get('/', protect, admin, getAllUsers);
router.get('/:id', protect, admin, getUserById);
router.get('/addresses', protect, getUserAddresses);
router.post('/addresses', protect, addAddress);
router.put('/addresses/:id', protect, updateAddress);
router.delete('/addresses/:id', protect, deleteAddress);
router.delete('/:id', protect, deleteUserAccount);

export default router;