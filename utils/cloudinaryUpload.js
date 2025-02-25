import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary.js';

// Product image upload configuration
const productStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'waterbottle-store/products',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 800, height: 800, crop: 'limit' }]
    }
});

export const productUpload = multer(
  
    {
        storage: productStorage,
        limits: { fileSize: 5 * 1024 * 1024 } // 5MB
    });

