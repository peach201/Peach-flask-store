import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
        required: false, // Make the user field optional
    },
    items: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        name: String,
        quantity: {
            type: Number,
            required: true,
            min: [1, 'Quantity cannot be less than 1']
        },
        price: {
            type: Number,
            required: true
        },
        image: String
    }],
    subtotal: {
        type: Number,
        required: false
    },
    shippingCost: {
        type: Number,
        required: false
    },
    discount: {
        type: Number,
        required: false,
        default: 0
    },
    totalAmount: {
        type: Number,
        required: true
    },
    shippingAddress: {
        fullName: String,
        address: String,
        city: String,
        postalCode: String,
        country: String,
        email: String,
        phone: String
    },
    paymentMethod: {
        type: String,
        enum: ['COD', 'PayFast'],
        required: true
    },
    paymentResult: {
        id: String,
        status: String,
        update_time: String,
        email_address: String
    },
    couponUsed: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Coupon',
        required: false
    },
    status: {
        type: String,
        enum: ['Processing', 'Shipped', 'Delivered', 'Cancelled'],
        default: 'Processing'
    },
    deliveredAt: Date,
    trackingId: {
        type: String,
        required: false
    }
}, {
    timestamps: true
});

export default mongoose.model('Order', orderSchema);