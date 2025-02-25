import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log(`MongoDB Connected: ${conn.connection.host}`);

        // Database event listeners
        mongoose.connection.on('connected', () => {
            console.log('Mongoose connected to DB');
        });

        mongoose.connection.on('error', (err) => {
            console.log(`Mongoose connection error: ${err}`);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('Mongoose disconnected');
        });

    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

export default connectDB;