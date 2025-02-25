import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Coupon from '../models/Coupon.js';
import { handleResponse, handleError } from '../utils/responseHandler.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import transporter from '../config/email.js';

// Helper: Generate rich error messages
const validationError = (missingFields) =>
    `Missing required fields: ${missingFields.join(', ')}`;

// Main Order Controller
export const orderController = {
    // Create New Order
    createOrder: async (req, res) => {
        try {
            const { items, shippingAddress, paymentMethod, couponCode, ...amounts } = req.body;
            const user = req.user;

            // Validate input
            const requiredFields = ['email', 'phone', 'name', 'subtotal', 'shippingCost', 'shippingAddress', 'totalAmount'];


            const missingFields = requiredFields.filter(field => !req.body[field]);
            if (missingFields.length > 0) return handleError(res, 400, validationError(missingFields));
            if (!items?.length) return handleError(res, 400, 'No order items specified');

            // Process products and validate stock
            const products = await Product.find({ _id: { $in: items.map(i => i.id) } });
            const [orderItems, calculatedSubtotal] = await processOrderItems(items, products);

            // Validate financials
            validateOrderAmounts(amounts, calculatedSubtotal, res);

            // Handle coupons
            const coupon = await handleCoupon(couponCode, user, amounts.subtotal, res);
            if (couponCode && !coupon) return; // Error already handled

            // Create order document
            const order = await createOrderDocument({
                items: orderItems,
                shippingAddress: buildShippingAddress(req.body, shippingAddress),
                paymentMethod,
                amounts,
                user: user?._id,
                coupon
            });

            // Handle payment integration
            if (paymentMethod === 'PayFast') {
                order.paymentResult = generatePayfastPayload(order);
            }

            await order.save();

            // Guest user communication
            if (!user) {
                sendOrderEmail({
                    email: order.shippingAddress.email,
                    subject: 'Order Confirmation',
                    template: 'orderConfirmation',
                    order
                });
            }

            handleResponse(res, 201, 'Order created successfully', order);

        } catch (error) {
            handleError(res, 500, error.message);
        }
    },

    // Get Order by ID
    getOrderById: async (req, res) => {
        try {
            const order = await Order.findById(req.params.id)
                .populate('user', 'name email')
                .populate('items.product', 'name images');

            if (!order) return handleError(res, 404, 'Order not found');
            if (!authorizeOrderAccess(order, req.user)) return handleError(res, 403, 'Unauthorized access');

            handleResponse(res, 200, 'Order retrieved', order);
        } catch (error) {
            handleError(res, 500, error.message);
        }
    },

    // Get User Orders
    getUserOrders: async (req, res) => {
        try {
            const orders = await Order.find({ user: req.user._id })
                .sort('-createdAt')
                .populate('items.product', 'name images ');

            
            handleResponse(res, 200, 'Orders retrieved', orders);
        } catch (error) {
            handleError(res, 500, error.message);
        }
    },

    // Get All Orders (Admin)
    getAllOrders: async (req, res) => {
        try {
            const { page = 1, limit = 20, status } = req.query;
            const filter = status ? { status } : {};

            const [orders, count] = await Promise.all([
                Order.find(filter)
                    .limit(limit * 1)
                    .skip((page - 1) * limit)
                    .sort('-createdAt')
                    .populate('user', 'name email'),
                Order.countDocuments(filter)
            ]);

            handleResponse(res, 200, 'Orders retrieved', {
                orders,
                totalPages: Math.ceil(count / limit),
                currentPage: page
            });
        } catch (error) {
            handleError(res, 500, error.message);
        }
    },

    // Update Order Status (Admin)
    updateOrderStatus: async (req, res) => {
        try {
            const { status, trackingId } = req.body;
            const validStatuses = ['Processing', 'Shipped', 'Delivered', 'Cancelled','Tracking'];

            if (!validStatuses.includes(status)) {
                return handleError(res, 400, 'Invalid status value');
            }

            const order = await Order.findByIdAndUpdate(
                req.params.id,
                { status, ...(trackingId && { trackingId }) },
                { new: true }
            );

            if (!order) return handleError(res, 404, 'Order not found');

            // Status-specific actions
            handleStatusChange(order, status, req.user);

            handleResponse(res, 200, 'Order updated', order);
        } catch (error) {
            handleError(res, 500, error.message);
        }
    },
    

    // PayFast Notification Handler
    handlePayfastNotification: async (req, res) => {
        try {
            const data = req.body;
            const signature = data.signature;

            delete data.signature;
            const isValid = verifyPayfastSignature(data, signature);

            if (!isValid) return res.status(400).send('Invalid signature');

            const order = await Order.findById(data.m_payment_id);
            if (!order) return res.status(404).send('Order not found');

            updateOrderFromPayment(order, data);
            await order.save();

            res.status(200).end();
        } catch (error) {
            res.status(500).send('Server error');
        }
    },


    getSalesStats: async (req, res) => {
        try {
            const { startDate, endDate, period } = req.query;
          
            let matchStage = {};
            if (startDate && endDate) {
                matchStage = {
                    createdAt: {
                        $gte: new Date(startDate),
                        $lte: new Date(endDate)
                    }
                };
            } else if (period) {
                const now = new Date();
                let start;
                switch (period) {
                    case 'week':
                        start = new Date(now.setDate(now.getDate() - 7));
                        break;
                    case 'month':
                        start = new Date(now.setMonth(now.getMonth() - 1));
                        break;
                    case 'year':
                        start = new Date(now.setFullYear(now.getFullYear() - 1));
                        break;
                    default:
                        start = new Date(0); // Default to all time if period is invalid
                }
                matchStage = {
                    createdAt: {
                        $gte: start,
                        $lte: new Date()
                    }
                };
            }

            const stats = await Order.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: null,
                        totalOrders: { $sum: 1 },
                        couponsUsed: {
                            $sum: {
                                $cond: [{ $ifNull: ["$couponUsed", false] }, 1, 0]
                            }
                        },
                        totalSales: { $sum: { $ifNull: ["$subtotal", 0] } },
                        totalShippingCost: { $sum: { $ifNull: ["$shippingCost", 0] } },
                        totalRevenue: { $sum: "$totalAmount" }
                    }
                }
            ]);

            const result = stats[0] || {
                totalOrders: 0,
                couponsUsed: 0,
                totalSales: 0,
                totalShippingCost: 0,
                totalRevenue: 0
            };
            handleResponse(res, 200, 'Sales stats retrieved', result);
        } catch (error) {
            handleError(res, 500, 'Server error while fetching sales stats');
        }
    }
};

// Helper Functions
const processOrderItems = async (items, products) => {
    let calculatedSubtotal = 0;
    const orderItems = [];

    for (const item of items) {
        const product = products.find(p => p._id.equals(item.id));
        if (!product) throw new Error(`Product not found: ${item.id}`);
        if (product.stock < item.quantity) {
            throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}`);
        }

        product.stock -= item.quantity;
        await product.save();

        orderItems.push({
            product: product._id,
            name: product.name,
            quantity: item.quantity,
            price: product.price,
            image: product.images?.[0]?.url
        });

        calculatedSubtotal += product.price * item.quantity;
    }

    return [orderItems, calculatedSubtotal];
};

const validateOrderAmounts = (amounts, calculatedSubtotal, res) => {
    const calculatedTotal = calculatedSubtotal + amounts.shippingCost - amounts.discount;
    if (amounts.totalAmount !== calculatedTotal) {
        handleError(res, 400, 'Invalid total amount calculation');
        throw new Error('Amount validation failed');
    }
};

const handleCoupon = async (couponCode, user, subtotal) => {
    if (!couponCode) return null;
    if (!user) throw new Error('Authentication required for coupon use');

    
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
    if (!coupon ) {
        throw new Error('Invalid or expired coupon');
    }

    return coupon
};

const createOrderDocument = ({
    items,
    shippingAddress,
    paymentMethod,
    amounts,
    user,
    coupon
}) => {
    return new Order({
        items,
        shippingAddress,
        paymentMethod,
        subtotal: amounts.subtotal,
        shippingCost: amounts.shippingCost,
        discount: amounts.discount,
        totalAmount: amounts.totalAmount,
        user: user?._id,
        couponUsed: coupon?._id,
        status: 'Processing'
    });
};

const buildShippingAddress = (body, address) => ({
    ...address,
    email: body.email,
    phone: body.phone,
    fullName: body.name
});

const generatePayfastPayload = (order) => {
    const params = {
        merchant_id: process.env.PAYFAST_MERCHANT_ID,
        merchant_key: process.env.PAYFAST_MERCHANT_KEY,
        return_url: process.env.PAYFAST_RETURN_URL,
        cancel_url: process.env.PAYFAST_CANCEL_URL,
        notify_url: process.env.PAYFAST_NOTIFY_URL,
        m_payment_id: order._id.toString(),
        amount: order.totalAmount.toFixed(2),
        item_name: `Order #${order._id}`
    };

    if (process.env.PAYFAST_PASSPHRASE) {
        params.passphrase = process.env.PAYFAST_PASSPHRASE;
    }

    const signatureString = Object.keys(params)
        .sort()
        .map(key => `${key}=${encodeURIComponent(params[key])}`)
        .join('&');

    params.signature = crypto.createHash('md5')
        .update(signatureString)
        .digest('hex');

    return {
        redirectUrl: `${process.env.PAYFAST_URL}?${new URLSearchParams(params)}`,
        status: 'pending'
    };
};

const authorizeOrderAccess = (order, user) => {
    return order.user?.equals(user._id) || user.role === 'admin';
};

const handleStatusChange = async (order, newStatus, user) => {
    if (newStatus === 'Cancelled') {
        await restoreStock(order.items);
    }

    if (newStatus === 'Delivered') {
        order.deliveredAt = new Date();
    }

    sendStatusEmail(order, newStatus, user);
};

const restoreStock = async (items) => {
    const bulkOps = items.map(item => ({
        updateOne: {
            filter: { _id: item.product },
            update: { $inc: { stock: item.quantity } }
        }
    }));

    await Product.bulkWrite(bulkOps);
};

const sendStatusEmail = (order, status, user) => {
    if (user?.role !== 'admin') return;

    const templates = {
        Shipped: {
            subject: 'Your Order Has Shipped!',
            template: 'orderShipped'
        },
        Delivered: {
            subject: 'Order Delivered - Leave a Review',
            template: 'orderDelivered'
        },
        Cancelled: {
            subject: 'Order Cancellation Notice',
            template: 'orderCancelled'
        },
        Tracking: {
            subject: 'Order Tracking Information',
            template: 'orderTracking'
        }
    };

    if (templates[status]) {
        sendOrderEmail({
            email: order.shippingAddress.email,
            ...templates[status],
            order
        });
    }
};

const verifyPayfastSignature = (data, receivedSignature) => {
    let signatureString = Object.keys(data)
        .sort()
        .map(key => `${key}=${encodeURIComponent(data[key])}`)
        .join('&');

    if (process.env.PAYFAST_PASSPHRASE) {
        signatureString += `&passphrase=${encodeURIComponent(process.env.PAYFAST_PASSPHRASE)}`;
    }

    const expectedSignature = crypto
        .createHash('md5')
        .update(signatureString)
        .digest('hex');

    return expectedSignature === receivedSignature;
};

const updateOrderFromPayment = (order, data) => {
    order.paymentResult = {
        id: data.pf_payment_id,
        status: data.payment_status,
        update_time: new Date().toISOString(),
        rawData: data
    };

    if (data.payment_status === 'COMPLETE') {
        order.status = 'Processing';
    } else if (data.payment_status === 'FAILED') {
        order.status = 'Cancelled';
    }
};

// Email System
const emailTemplates = {
    orderConfirmation: (order) => `
    <h1>Thank you for your order!</h1>
    <p><strong>Order ID:</strong> ${order._id}</p>
    <h3>Shipping Details:</h3>
    <p>${Object.values(order.shippingAddress).filter(Boolean).join(', ')}</p>
    <h3>Items (${order.items.length}):</h3>
    <ul>
      ${order.items.map(item => `
        <li style="margin-bottom: 15px;">
          ${item.image ? `<img src="${item.image}" style="height: 50px; margin-right: 10px;">` : ''}
          ${item.name} × ${item.quantity} @ Rs ${item.price}
        </li>
      `).join('')}
    </ul>
    <h3>Total: Rs ${order.totalAmount}</h3>
  `,

    orderTracking: (order) => `
    <h1>🚚 Your Order is on the way!</h1>
    <p>We are excited to let you know that your order is on its way. Here are the details:</p>
    <p><strong>Tracking ID:</strong> ${order.trackingId || 'Tracking id will be given soon'}</p>
    <h3>Shipping Details:</h3>
    <p>${Object.values(order.shippingAddress).filter(Boolean).join(', ')}</p>
    <h3>Order Summary:</h3>
    <ul>
      ${order.items.map(item => `
        <li style="margin-bottom: 15px;">
          ${item.image ? `<img src="${item.image}" style="height: 50px; margin-right: 10px;">` : ''}
          ${item.name} × ${item.quantity} @ Rs ${item.price}
        </li>
      `).join('')}
    </ul>
    <h3>Total: Rs ${order.totalAmount}</h3>
    <p>You can view the full details of your order and track its progress by clicking the link below:</p>
    <p><a href="${process.env.CLIENT_URL}/orders/${order._id}" style="color: blue;">View Order Details</a></p>
    <p>Thank you for shopping with us!</p>
    `,
    orderShipped: (order) => `
      <h1>🚚 Your Order Has Shipped!</h1>
    <p>We are excited to let you know that your order is on its way. Here are the details:</p>
    <p><strong>Tracking ID:</strong> ${order.trackingId || 'Tracking id will be given soon'}</p>
    <h3>Shipping Details:</h3>
    <p>${Object.values(order.shippingAddress).filter(Boolean).join(', ')}</p>
    <h3>Order Summary:</h3>
    <ul>
      ${order.items.map(item => `
        <li style="margin-bottom: 15px;">
          ${item.image ? `<img src="${item.image}" style="height: 50px; margin-right: 10px;">` : ''}
          ${item.name} × ${item.quantity} @ Rs ${item.price}
        </li>
      `).join('')}
    </ul>
    <h3>Total: Rs ${order.totalAmount}</h3>
    <p>Thank you for shopping with us!</p>
  `,

    orderDelivered: (order) => `
        <h2>🎉 Order Delivered!</h2>
    <p>We hope you're enjoying your purchase!</p>
    <h3>Order Summary:</h3>
    <ul>
      ${order.items.map(item => `
        <li style="margin-bottom: 15px;">
          ${item.image ? `<img src="${item.image}" style="height: 50px; margin-right: 10px;">` : ''}
          ${item.name} × ${item.quantity} @ Rs ${item.price}
        </li>
      `).join('')}
    </ul>
    <h3>Total: Rs ${order.totalAmount}</h3>
    <p>We would love to hear your feedback. Please leave a review.</p>
    <p>Thank you for shopping with us!</p>
  `,

    orderCancelled: (order) => `
  <h1>Your order has been cancelled</h1>
    <p><strong>Order ID:</strong> ${order._id}</p>
    <h3>Shipping Details:</h3>
    <p>${Object.values(order.shippingAddress).filter(Boolean).join(', ')}</p>
    <h3>Items (${order.items.length}):</h3>
    <ul>
      ${order.items.map(item => `
        <li style="margin-bottom: 15px;">
          ${item.image ? `<img src="${item.image}" style="height: 50px; margin-right: 10px;">` : ''}
          ${item.name} × ${item.quantity} @ Rs ${item.price}
        </li>
      `).join('')}
    </ul>
    <h3>Total: Rs ${order.totalAmount}</h3>
    <p>If you have any questions, please contact our support team.</p>
    `
};

const sendOrderEmail = async ({ email, subject, template, order }) => {
    try {
        await transporter.sendMail({
            from: `<${process.env.EMAIL_USER}>`,
            to: email,
            subject,
            html: emailTemplates[template](order)
        });
    } catch (error) {
        console.error('Email Error:', error);
    }
};




