import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    },
    tls: {
        rejectUnauthorized: false // For local development only
    }
});

// Verify connection
transporter.verify((error) => {
    if (error) {
        console.error('❌ Email server error:', error);
    } else {
        console.log('✅ Email server ready to send messages');
    }
});

export default transporter;