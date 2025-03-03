import express from 'express';
import {
    createSettings,
    getSettings,
    updateSettings,
    deleteSettings,
    getStats,
} from '../controllers/settingsController.js';
import { protect, admin } from '../middlewares/auth.js';

const router = express.Router();

router.post('/', createSettings);
router.get('/stats', getStats);
router.get('/', getSettings);
router.put('/',  updateSettings);
router.delete('/', protect, admin, deleteSettings);

export default router;
