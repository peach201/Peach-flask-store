import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: true
    },
    discountValue: {
        type: Number,
        required: true,
        min: [0, 'Discount value cannot be negative']
    },
    minPurchase: {
        type: Number,
        min: [0, 'Minimum purchase cannot be negative'],
        default: 0
    },
    maxPurchase: {
        type: Number,
        min: [0, 'Max purchase cannot be negative']
    },
    totalCoupons: {
        type: Number,
        min: [0, 'Total coupons cannot be negative'],
        required: true
    },
    usedCoupons: {
        type: Number,
        default: 0
    },
    maxUsesPerUser: {
        type: Number,
        default: 1, // Default: Each user can use it once
        min: [1, 'Max uses per user must be at least 1']
    },
    usedBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        timesUsed: {
            type: Number,
            default: 0
        }
    }],
    startAt: {
        type: Date, // When the coupon starts being valid
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

couponSchema.methods.isValidForUser = function (userId) {
    return this.usedBy.some(u => u.userId.equals(userId) && u.timesUsed < this.maxUsesPerUser);
};

couponSchema.methods.applyCoupon = function (subtotal) {
    const discount = this.discountType === 'percentage'
        ? (subtotal * this.discountValue) / 100
        : this.discountValue;

    return Math.min(discount, subtotal);
};

export default mongoose.model('Coupon', couponSchema);
