import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema({
    shippingFee: {
        type: Number,
        required: true,
        default: 0
    }
}, { timestamps: true });

export default mongoose.model('Settings', settingsSchema);
