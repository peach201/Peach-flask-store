export const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;

    const response = {
        success: false,
        message: err.message || 'Server Error',
        stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack
    };

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        response.message = Object.values(err.errors).map(val => val.message).join(', ');
        response.statusCode = 400;
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        response.message = `Duplicate field value entered`;
        response.statusCode = 400;
    }

    res.status(statusCode).json(response);
};