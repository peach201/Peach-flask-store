import Coupon from '../models/Coupon.js';
import User from '../models/User.js';
import { handleResponse, handleError } from '../utils/responseHandler.js';

// @desc    Create new coupon
// @route   POST /api/coupons
// @access  Admin
export const createCoupon = async (req, res) => {
    try {
        const {
            code, discountType, discountValue, minPurchase, maxPurchase,
            maxUses, singleUse, totalCoupons, startAt, expiresAt
        } = req.body;

        if (discountType === 'percentage' && discountValue > 100) {
            return handleError(res, 400, 'Percentage discount cannot exceed 100%');
        }

        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            return handleError(res, 400, 'Coupon code already exists');
        }

        const coupon = await Coupon.create({
            code: code.toUpperCase(),
            discountType,
            discountValue,
            minPurchase: minPurchase || 0,
            maxPurchase: maxPurchase || null,
            maxUses: maxUses || null,
            singleUse: singleUse || false,
            totalCoupons: totalCoupons || null,
            startAt: startAt ? new Date(startAt) : new Date(),
            expiresAt: new Date(expiresAt),
            isActive: true,
            usedCoupons: 0,
            usedBy: []
        });

        const allCoupons = await Coupon.find().sort({ createdAt: -1 });
        handleResponse(res, 201, 'Coupon created successfully', allCoupons);

    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Get active coupons
// @route   GET /api/coupons
// @access  Public
export const getActiveCoupons = async (req, res) => {
    try {
        const currentDate = new Date();
        const coupons = await Coupon.find({
            isActive: true,
            expiresAt: { $gt: currentDate },
            $or: [{ maxUses: { $exists: false } }, { maxUses: { $gt: 0 } }]
        }).select('-usedBy -isActive');

        handleResponse(res, 200, 'Active coupons retrieved', coupons);
    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Get all coupons (Admin View)
// @route   GET /api/coupons/all
// @access  Admin
export const getAllCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        handleResponse(res, 200, 'All coupons retrieved', coupons);
    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Validate coupon
// @route   POST /api/coupons/validate
// @access  Private
export const validateCoupon = async (req, res) => {
    try {
        const { code, cartTotal } = req.body;
        const userId = req.user._id;
        const currentTime = new Date();

        const coupon = await Coupon.findOne({ code: code.toUpperCase() });

        if (!coupon || !coupon.isActive) {
            return handleError(res, 404, 'Invalid coupon code');
        }

        if (currentTime < coupon.startAt) {
            return handleError(res, 400, 'Coupon is not live yet');
        }

        if (currentTime > coupon.expiresAt) {
            return handleError(res, 400, 'Coupon has expired');
        }

        if (cartTotal < coupon.minPurchase) {
            return handleError(res, 400, `Minimum purchase of $${coupon.minPurchase} required`);
        }

        if (coupon.maxPurchase && cartTotal > coupon.maxPurchase) {
            return handleError(res, 400, `Maximum purchase allowed is $${coupon.maxPurchase}`);
        }

        if (coupon.usedCoupons >= coupon.totalCoupons) {
            return handleError(res, 400, 'Coupon usage limit reached');
        }

        const userUsage = coupon.usedBy.find(u => u.userId.toString() === userId.toString());
        if (userUsage && userUsage.timesUsed >= (coupon.maxUsesPerUser || 1)) {
            return handleError(res, 400, 'Coupon usage limit reached for this user');
        }

        let discount = coupon.discountType === 'percentage'
            ? cartTotal * (coupon.discountValue / 100)
            : coupon.discountValue;

        discount = Math.min(discount, cartTotal);

        coupon.usedCoupons += 1;
        if (userUsage) {
            userUsage.timesUsed += 1;
        } else {
            coupon.usedBy.push({ userId, timesUsed: 1 });
        }
        await coupon.save();

        handleResponse(res, 200, 'Coupon is valid', {
            valid: true,
            discount: Number(discount.toFixed(2)),
            discountType: coupon.discountType,
            code: coupon.code
        });

    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Update coupon
// @route   PUT /api/coupons/:code
// @access  Admin
export const updateCoupon = async (req, res) => {
    try {
        const { code } = req.params;
        const updates = req.body;
        
        const coupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (!coupon) {
            return handleError(res, 404, 'Coupon not found');
        }

        if (updates.code && updates.code !== coupon.code) {
            return handleError(res, 400, 'Coupon code cannot be changed');
        }

        if (updates.discountValue && coupon.discountType === 'percentage' && updates.discountValue > 100) {
            return handleError(res, 400, 'Percentage discount cannot exceed 100%');
        }

        const allowedUpdates = [
            'discountValue', 'minPurchase', 'maxPurchase', 'maxUses','maxUsesPerUser',
            'singleUse', 'totalCoupons', 'startAt', 'expiresAt', 'isActive'
        ];

        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                coupon[key] = updates[key];
            }
        });

        await coupon.save();
        const updatedCoupons = await Coupon.find().sort({ createdAt: -1 });

        handleResponse(res, 200, 'Coupon updated successfully', updatedCoupons);

    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Delete coupon (soft delete)
// @route   DELETE /api/coupons/:code
// @access  Admin
export const deleteCoupon = async (req, res) => {
    try {
        const { code } = req.params;

        const coupon = await Coupon.findOneAndDelete({ code: code.toUpperCase() });


        if (!coupon) {
            return handleError(res, 404, 'Coupon not found');
        }

        const remainingCoupons = await Coupon.find().sort({ createdAt: -1 });
        handleResponse(res, 200, 'Coupon deactivated successfully', remainingCoupons);

    } catch (error) {
        handleError(res, 500, error.message);
    }
};
