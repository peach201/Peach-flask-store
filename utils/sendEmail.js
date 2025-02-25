import transporter from '../config/email.js';

export const sendEmail = async (options) => {
    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: options.email,
        subject: options.subject,
        html: options.html,
        text: options.text
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        throw new Error('Email could not be sent');
    }
};