import transporter from './config/email.js';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import { errorHandler } from './middlewares/error.js';
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import couponRoutes from './routes/couponRoutes.js';
import userRoutes from './routes/userRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import settingRoutes from './routes/settingRoutes.js';
import { sendContactEmail } from './controllers/contactController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// If you’re behind a reverse proxy (e.g. AWS ELB), trust the first proxy
app.set('trust proxy', 1);

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const allowedOrigins = [
    "https://main.d3si3a5vmaup5e.amplifyapp.com",
    "https://peachflask.com",
    "https://www.peachflask.com",
    "http://localhost:3000",
];

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error(`CORS: Origin ${origin} not allowed`));
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['Set-Cookie'],
    })
);




// Example route to set a cookie
app.get('/set-cookie', (req, res) => {
    res.cookie('exampleCookie', 'cookieValue', {
        httpOnly: true,
        secure: true, // Ensure this is true for HTTPS
        sameSite: 'None', // Ensure this is 'None' for cross-origin requests
    });
    res.send('Cookie set');
});


app.get('/', (req, res) => {
    res.send('CORS is configured correctly.');
});




// Serve static files (images, etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/settings', settingRoutes);
app.post('/api/send-email', sendContactEmail);

// Health Check
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running',
        timestamp: new Date(),
        uptime: process.uptime(),
    });
});

app.get('/api/test-email', async (req, res) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: 'test@example.com',
            subject: 'Test Email',
            text: 'This is a working test email',
        });
        res.send('✅ Test email sent successfully');
    } catch (error) {
        console.error('❌ Email error:', error);
        res.status(500).send('❌ Email sending failed');
    }
});

// Error Handling Middleware
app.use(errorHandler);

// Handle 404
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
    });
});

const hostname = '0.0.0.0'; // or use '0.0.0.0' to allow external access
const PORT = process.env.PORT || 5000;

app.listen(PORT, hostname, () => {
    console.log(`Server running on http://${hostname}:${PORT}/`);
});
