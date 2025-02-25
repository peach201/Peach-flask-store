import mongoose from 'mongoose';
const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please enter product name'],
        trim: true,
        maxlength: [120, 'Product name cannot exceed 120 characters']
    },
    description: {
        type: String,
        required: [true, 'Please enter product description']
    },
    price: {
        type: Number,
        required: [true, 'Please enter product price'],
        min: [0, 'Price cannot be negative']
    },
    sizes: [{
        type: String,
        enum: ['500ml', '1L', '1.5L', '2L']
    }],
    categories: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
    }],
    stock: {
        type: Number,
        required: true,
        default: 0,
        min: [0, 'Stock cannot be negative']
    },
    images: [{
        public_id: {
            type: String,
            required: true
        },
        url: {
            type: String,
            required: true
        }
    }],
    ratings: {
        type: Number,
        default: 0
    },
    numOfReviews: {
        type: Number,
        default: 0
    },
    slug: String
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual populate reviews
productSchema.virtual('reviews', {
    ref: 'Review',
    localField: '_id',
    foreignField: 'product'
});

// Create a text index on the 'name' and 'description' fields for search functionality
productSchema.index({ name: 'text', description: 'text' });

export default mongoose.model('Product', productSchema);