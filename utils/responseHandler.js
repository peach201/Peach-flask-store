export const handleResponse = (res, statusCode, message, data = null) => {
    const response = {
        success: statusCode >= 200 && statusCode < 300,
        message,
        data
    };
    // Remove data field if null/undefined
    if (!data) delete response.data;
    return res.status(statusCode).json(response);
};

export const handleError = (res, statusCode, message) => {
    return res.status(statusCode).json({
        success: false,
        message
    });
};















