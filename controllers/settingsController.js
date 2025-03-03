import category from '../models/category.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Settings from '../models/settings.js'
// CREATE settings (Admin only)
// This route creates the settings document only if one does not already exist.
export const createSettings = async (req, res) => {
    try {
        const { shippingFee } = req.body;
        let settings = await Settings.findOne();
        if (settings) {
            return res.status(400).json({ error: 'Settings already exist. Use PUT to update.' });
        }
        settings = new Settings({ shippingFee });
        await settings.save();
        res.status(201).json({ message: 'Settings created successfully', settings });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const getStats = async (req, res) => {
    try {
        const totalProducts = await Product.countDocuments();
        const totalCategories = await category.countDocuments();

        // Calculate total sales amount from the start to today
        const totalSalesResult = await Order.aggregate([
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: "$totalAmount" }
                }
            }
        ]);

        const totalSales = totalSalesResult.length > 0 ? totalSalesResult[0].totalSales : 0;

        const stats = {
            totalSales: totalSales,
            totalProducts: totalProducts,
            totalCategories: totalCategories,
        };
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// READ settings
export const getSettings = async (req, res) => {
    try {
        const settings = await Settings.findOne();
        if (!settings) return res.status(404).json({ error: 'Settings not found' });
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// UPDATE settings (Admin only)
export const updateSettings = async (req, res) => {
    try {
        const { shippingFee } = req.body;
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings({ shippingFee });
        } else {
            settings.shippingFee = shippingFee;
        }
        await settings.save();
        res.json({ message: 'Settings updated successfully', settings });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// DELETE settings (Admin only)
export const deleteSettings = async (req, res) => {
    try {
        const settings = await Settings.findOneAndDelete();
        if (!settings) return res.status(404).json({ error: 'Settings not found' });
        res.json({ message: 'Settings deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
