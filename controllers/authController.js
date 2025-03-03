import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sendEmail } from '../utils/sendEmail.js';
import {
    generateAccessToken,
    generateRefreshToken,
    generateEmailVerificationToken,
    generatePasswordResetToken
} from '../utils/generateToken.js';
import { handleResponse, handleError } from '../utils/responseHandler.js';
import {
    verificationEmail,
    passwordResetEmail
} from '../utils/emailTemplates.js';

// Helper: Set authentication cookies
const setAuthCookies = (res, accessToken, refreshToken) => {

    const cookieOptions = {
        httpOnly: true,
        secure: true,   // Must be true for HTTPS
        sameSite: "None" // Required for cross-site cookies in HTTPS
    };


    res.cookie('accessToken', accessToken, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.cookie('refreshToken', refreshToken, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days     
    });
    console.log("Set-Cookie Header:", res.getHeaders()["set-cookie"]);

};


// @desc    Register new user
// @route   POST /api/auth/signup
// @access  Public
export const signup = async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        // Validate input
        if (!name || !email || !password) {
            return handleError(res, 400, 'Name, email, and password are required');
        }

        // Check existing user
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return handleError(res, 400, 'User already exists');
        }

        // Create and save user
        const user = await User.create({
            name,
            email,
            password,
            phone,
            verificationToken: generateEmailVerificationToken(),
            verificationExpires: Date.now() + 3600000 // 1 hour
        });
        
        // Send verification email
        const verificationUrl = `${process.env.CLIENT_URL}/auth/verify-email/${user.verificationToken}`;
        await sendEmail({
            email: user.email,
            subject: 'Email Verification',
            html: verificationEmail(user.name, verificationUrl)
        });

        handleResponse(res, 201, 'Verification email sent', {
            id: user._id,
            name: user.name,
            email: user.email
        });

    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Verify email
// @route   GET /api/auth/verify-email/:token
// @access  Public
export const verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;

        const user = await User.findOne({ verificationToken: token });

        if (!user) {
            return handleError(res, 400, 'Invalid token. A new verification email has been sent.');
        }

        if (user.verificationExpires < Date.now()) {
            // Generate new verification token
            user.verificationToken = generateEmailVerificationToken();
            user.verificationExpires = Date.now() + 3600000; // 1 hour
            await user.save();



            const verificationUrl = `${process.env.CLIENT_URL}/auth/verify-email/${user.verificationToken}`;

            
            const email = await sendEmail({
                email: user.email,
                subject: 'New Email Verification Link',
                html: verificationEmail(user.name, verificationUrl)
            });
            

            return handleError(res, 400, 'Verification token expired. A new verification email has been sent.');
        }
        // Mark user as verified
        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationExpires = undefined;
        await user.save();

        handleResponse(res, 200, 'Email verified successfully');



    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
// Login Controller
export const login = async (req, res) => {
    
    
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email }).select('+password');
        if (!user) return handleError(res, 401, 'Invalid credentials');

        if (!user.isVerified)
            return handleError(res, 403, 'Please verify your email first');

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return handleError(res, 401, 'Invalid credentials');

        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        setAuthCookies(res, accessToken, refreshToken);

        handleResponse(res, 200, 'Login successful', {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
        });

    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return handleError(res, 404, 'User not found');
        }

        // Generate and save reset token
        const resetToken = generatePasswordResetToken();
        user.resetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.resetExpires = Date.now() + 600000; // 10 minutes
        await user.save();

        // Send password reset email
        const resetUrl = `${req.protocol}://${req.get('host')}/api/auth/reset-password/${resetToken}`;
        await sendEmail({
            email: user.email,
            subject: 'Password Reset Request',
            html: passwordResetEmail(user.name, resetUrl)
        });

        handleResponse(res, 200, 'Password reset email sent');

    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password/:token
// @access  Public
// Password Reset Controller
export const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        const hashedToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        const user = await User.findOne({
            resetToken: hashedToken,
            resetExpires: { $gt: Date.now() }
        });

        if (!user) return handleError(res, 400, 'Invalid or expired token');

        user.password = password;
        user.resetToken = undefined;
        user.resetExpires = undefined;
        await user.save();

        handleResponse(res, 200, 'Password reset successful');

    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Refresh access token
// @route   POST /api/auth/refresh-token
// @access  Public
export const refreshToken = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {
            return handleError(res, 401, 'No refresh token provided');
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return handleError(res, 401, 'Invalid refresh token');
        }

        const newAccessToken = generateAccessToken(user._id);
        setAuthCookies(res, newAccessToken, refreshToken);

        handleResponse(res, 200, 'Token refreshed', { accessToken: newAccessToken });

    } catch (error) {
        handleError(res, 401, 'Invalid refresh token');
    }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        handleResponse(res, 200, 'Current user retrieved', user);
    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
export const logout = (req, res) => {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    handleResponse(res, 200, 'Successfully logged out');
};

// Add this controller function
export const resendVerificationEmail = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return handleError(res, 404, 'User not found');
        }

        if (user.isVerified) {
            return handleError(res, 400, 'Email already verified');
        }

        // Generate new verification token
        user.verificationToken = generateEmailVerificationToken();
        user.verificationExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        // Resend email
        const verificationUrl = `${req.protocol}://${req.get('host')}/api/auth/verify-email/${user.verificationToken}`;
        await sendEmail({
            email: user.email,
            subject: 'Resend Email Verification',
            html: verificationEmail(user.name, verificationUrl)
        });

        handleResponse(res, 200, 'Verification email resent');

    } catch (error) {
        handleError(res, 500, error.message);
    }
};