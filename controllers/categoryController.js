import Category from '../models/category.js';

// CREATE a new category (Admin only)
export const createCategory = async (req, res) => {
    console.log(req.body);
    try {
        const { name, description, isActive } = req.body;
        const category = new Category({ name, description, isActive });
        await category.save();
        res.status(201).json({ message: 'Category created successfully', category });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// READ all categories
export const getCategories = async (req, res) => {
    try {
        const categories = await Category.find({});
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// READ a single category by ID
export const getCategoryById = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) return res.status(404).json({ error: 'Category not found' });
        res.json(category);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// UPDATE a category (Admin only)
export const updateCategory = async (req, res) => {
    try {
        const { name, description, isActive } = req.body;
        const category = await Category.findByIdAndUpdate(
            req.params.id,
            { name, description, isActive },
            { new: true, runValidators: true }
        );
        if (!category) return res.status(404).json({ error: 'Category not found' });
        res.json({ message: 'Category updated successfully', category });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// DELETE a category (Admin only)
export const deleteCategory = async (req, res) => {
    try {
        const category = await Category.findByIdAndDelete(req.params.id);
        if (!category) return res.status(404).json({ error: 'Category not found' });
        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
