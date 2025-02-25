import Product from '../models/Product.js';
import { handleResponse, handleError } from '../utils/responseHandler.js';
import APIFeatures from '../utils/apiFeatures.js';
import { deleteFromCloudinary } from '../config/cloudinary.js';




// @desc    Get all products
// @route   GET /api/products
// @access  Public
export const getAllProducts = async (req, res) => {
    try {
        const features = new APIFeatures(Product.find(), req.query)
            .filter()
            .sort()
            .limitFields()
            .paginate();

        const products = await features.query;
        const total = await Product.countDocuments(features.filterQuery);

        handleResponse(res, 200, 'Products retrieved successfully', {
            products,
            total,
            results: products.length,
            currentPage: features.page,
            totalPages: Math.ceil(total / features.limit)
        });

    } catch (error) {
        handleError(res, 500, error.message);
    }
};


// @desc    Get recent 6 products
// @route   GET /api/products/recent
// @access  Public
export const getRecentProducts = async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 }).limit(6);
        handleResponse(res, 200, 'Recent products retrieved successfully', products);
    } catch (error) {
        handleError(res, 500, error.message);
    }
};


// @desc    Get products by categories
// @route   GET /api/products/by-categories
// @access  Public
export const getProductsByCategories = async (req, res) => {
    try {
        const { categories } = req.query;

        if (!categories) return handleError(res, 400, 'Categories query required');

        const categoryList = categories.split(',');

        let products = [];

        // Retrieve all products for each category
        for (const category of categoryList) {
            const categoryProducts = await Product.find({ categories: category });
            products = products.concat(categoryProducts);
        }

        // Remove duplicate products based on _id
        const uniqueProducts = products.filter((product, index, self) =>
            index === self.findIndex((p) => p._id.toString() === product._id.toString())
        );

        // Shuffle the array of unique products
        for (let i = uniqueProducts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [uniqueProducts[i], uniqueProducts[j]] = [uniqueProducts[j], uniqueProducts[i]];
        }

        // Select the first 5 products from the shuffled array
        const selectedProducts = uniqueProducts.slice(0, 5);


        return handleResponse(res, 200, 'Products by categories retrieved successfully', selectedProducts);
    } catch (error) {
        return handleError(res, 500, error.message);
    }
};





// @desc    Search products
// @route   GET /api/products/search
// @access  Public
export const searchProducts = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return handleError(res, 400, 'Search query required');

        const products = await Product.find({
            $text: { $search: q },
            stock: { $gt: 0 }
        }, {
            score: { $meta: "textScore" }
        }).sort({ score: { $meta: "textScore" } });

        handleResponse(res, 200, 'Search results', products);

    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
export const getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate({
                path: 'reviews',
                select: 'rating comment user createdAt',
                options: { sort: { createdAt: -1 } },
                populate: {
                    path: 'user',
                    select: 'name'
                }
            })
            .populate({
                path: 'categories',
                select: 'name'
            });

        if (!product) {
            return handleError(res, 404, 'Product not found');
        }

        handleResponse(res, 200, 'Product details retrieved', product);

    } catch (error) {
        if (error.name === 'CastError') {
            return handleError(res, 400, 'Invalid product ID');
        }
        handleError(res, 500, error.message);
    }
};

// @desc    Create new product
// @route   POST /api/products
// @access  Admin

export const createProduct = async (req, res) => {

    try {

        // Extract product details
        const { name, description, price, sizes, categories, stock } = req.body;

        // Validate required fields
        if (!name || !description || !price || !categories || !stock) {
            return handleError(res, 400, "Missing required fields");
        }

        // Process uploaded images
        if (!req.files || req.files.length === 0) {
            return handleError(res, 400, "At least one image is required");
        }

        const images = req.files.map(file => ({
            public_id: file.filename || file.public_id,
            url: file.path || file.url
        }));


        // Ensure valid image upload
        if (images.some(image => !image.public_id || !image.url)) {
            await cleanupImages(images);
            return handleError(res, 400, "Image upload failed");
        }

        // Check if product already exists
        const existingProduct = await Product.findOne({ name });
        if (existingProduct) {
            await cleanupImages(images);
            return handleError(res, 400, "Product with this name already exists");
        }

        // Convert sizes and categories to arrays
        const sizeArray = Array.isArray(sizes) ? sizes : sizes.split(",");
        const categoryArray = Array.isArray(categories) ? categories : categories.split(",");

        // Create the new product
        const product = await Product.create({
            name,
            slug: name.toLowerCase().replace(/ /g, "-"),
            description,
            price,
            sizes: sizeArray,
            categories: categoryArray,
            stock,
            images
        });

        handleResponse(res, 201, "Product created successfully", product);

    } catch (error) {

        // Cleanup uploaded images if there was an error
        if (req.files?.length) {
            await cleanupImages(req.files.map(f => ({ public_id: f.public_id })));
        }

        handleError(res, 500, "Server error");
    }
};


// @desc    Update product
// @route   PUT /api/products/:id
// @access  Admin
export const updateProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return handleError(res, 404, 'Product not found');

        // Handle new images
        if (req.files?.length) {
            const newImages = req.files.map(file => ({
                public_id: file.public_id,
                url: file.secure_url
            }));
            product.images = [...product.images, ...newImages];
        }

        // Handle image deletions
        if (req.body.imagesToDelete) {
            await handleImageDeletions(req.body.imagesToDelete, product);
        }

        // Update other fields
        const updates = processUpdates(req.body, product);
        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, runValidators: true }
        );

        handleResponse(res, 200, 'Product updated successfully', updatedProduct);

    } catch (error) {
        if (req.files?.length) {
            await cleanupImages(req.files.map(f => ({ public_id: f.public_id })));
        }
        handleValidationError(error, res);
    }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Admin
export const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return handleError(res, 404, 'Product not found');

        // Delete all associated images
        await Promise.all(
            product.images.map(img =>
                deleteFromCloudinary(img.public_id)
            )
        );

        await Product.deleteOne({ _id: product._id });
        handleResponse(res, 200, 'Product deleted successfully', null);

    } catch (error) {
        if (error.name === 'CastError') {
            return handleError(res, 400, 'Invalid product ID');
        }
        handleError(res, 500, error.message);
    }
};

// Helper Functions
const handleImageDeletions = async (imagesToDelete, product) => {
    await Promise.all(
        imagesToDelete.map(async publicId => {
            await deleteFromCloudinary(publicId);
            product.images = product.images.filter(
                img => img.public_id !== publicId
            );
        })
    );
};

const processUpdates = (body, product) => {
    const updates = Object.keys(body)
        .filter(key => !['imagesToDelete'].includes(key))
        .reduce((obj, key) => {
            obj[key] = body[key];
            return obj;
        }, {});

    if (updates.name) {
        updates.slug = updates.name.toLowerCase().replace(/ /g, '-');
    }

    if (updates.sizes) updates.sizes = updates.sizes.split(',');
    if (updates.categories) updates.categories = updates.categories.split(',');

    return updates;
};

// Helper function to clean up images in case of errors
const cleanupImages = async (images) => {
    await Promise.all(
        images.map(img =>
            deleteFromCloudinary(img.public_id)
        )
    );
}; 


const handleValidationError = (error, res) => {
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return handleError(res, 400, messages.join(', '));
    }
    handleError(res, 500, error.message);
};