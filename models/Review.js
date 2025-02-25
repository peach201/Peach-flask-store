import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    } ,           
    rating: {
        type: Number,
        required: true,
        min: [1, 'Rating must be at least 1'],
        max: [5, 'Rating cannot exceed 5']
    },
    comment: {
        type: String,
        maxlength: [500, 'Review cannot exceed 500 characters']
    },
    images: [String],
    isApproved: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Index for unique user-product combination
reviewSchema.index(
    { product: 1, user: 1, order: 1 },
    { unique: true }
);

// Virtual populate
reviewSchema.virtual('orderDetails', {
    ref: 'Order',
    localField: 'order',
    foreignField: '_id',
    justOne: true
});

reviewSchema.virtual('productDetails', {
    ref: 'Product',
    localField: 'product',
    foreignField: '_id',
    justOne: true
});

export default mongoose.model('Review', reviewSchema);