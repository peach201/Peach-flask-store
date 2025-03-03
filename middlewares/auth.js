import jwt from 'jsonwebtoken';
import { handleError } from '../utils/responseHandler.js';
import User from '../models/User.js';

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization?.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
        token = req.cookies.accessToken || null;    
    }
    console.log("All Request Headers:", req.headers);
    console.log("Cookies received:", req.cookies);
    console.log("Authorization Header:", req.headers.authorization);
    console.log("Extracted Token:", token);


    if (!token) {
        return handleError(res, 401, 'Not authenticated');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = await User.findById(decoded.id).select('-password');
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return handleError(res, 401, 'Token expired');
        }
        return handleError(res, 401, 'Invalid access token');
    }
};

export { protect };
    
export const admin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return handleError(res, 403, 'Not authorized as admin');
    }
};


// middlewares/auth.js
export const optionalAuth = async (req, res, next) => {
    let token;

    // Check for token in Authorization header or cookie
    if (req.headers.authorization?.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
        token = req.cookies.accessToken;
    }

    if (!token) {
        req.user = null;
        return next();
    }

    try {
        // Verify token and get user
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = await User.findById(decoded.id).select('-password');
        next();
    } catch (error) {
        // Invalid token - treat as guest
        req.user = null;
        next();
    }
};