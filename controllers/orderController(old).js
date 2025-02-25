import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Coupon from '../models/Coupon.js';
import User from '../models/User.js';
import { handleResponse, handleError } from '../utils/responseHandler.js';
import { sendEmail } from '../utils/sendEmail.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';


// @desc    Create new order
// @route   POST /api/orders
// @access  Public (Guest) / Private (Users)

export const createOrder = async (req, res) => {
  
    try {
        
        const {
            items,
            shippingAddress,
            paymentMethod, // Expected values: "COD", "Card", "PayFast"
            couponCode,
            email,
            phone,
            name,
            subtotal,
            shippingCost,
            discount,
            totalAmount
        } = req.body;
        
        // Validate that there are order items
        if (!items || items.length === 0) {
            return handleError(res, 400, 'No order items specified');
        }
        
        // validtes all fields
        if (!items || !shippingAddress || !paymentMethod || !email || !phone || !name || !subtotal || !shippingCost || !discount || !totalAmount) {
            return handleError(res, 400, "All fields are required");
        }
        
        

        // Retrieve product details from database
        const productIds = items.map(item => item.id);
        const products = await Product.find({ _id: { $in: productIds } });

        let orderTotal = 0;
        const orderItems = [];
        
        
        for (const item of items) {
            
            const product = products.find(p => p._id.toString() === item.id);
            
            if (!product) {
                return handleError(res, 404, `Product not found: ${item.id}`);
            }
            
            if (product.stock < item.quantity) {
                return handleError(
                    res,
                    400,
                    `Insufficient stock for ${product.name}. Available: ${product.stock}`
                );
            }
            
            
            const itemTotal = product.price * item.quantity;
            orderTotal += itemTotal;
            orderItems.push({
                product: product._id,
                name: product.name,
                quantity: item.quantity,
                price: product.price,
                image: product.images && product.images[0]?.url
            });

            // Reduce stock
            product.stock -= item.quantity;
            await product.save();
        }
        
        // Verify coupon if provided
        let appliedDiscount = 0;
        let couponUsed = null;
        if (couponCode) {
            var coupon = null;
            coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
            if (!coupon) {
                return handleError(res, 404, 'Coupon not found');
            }

            // Check if the coupon is active and not expired
            const now = new Date();
            if (!coupon.isActive || now < new Date(coupon.startAt) || now > new Date(coupon.expiresAt)) {
                return handleError(res, 400, 'Coupon is not active or has expired');
            }

            // Check if the coupon has usage limits
            if (coupon.maxUses && coupon.uses >= coupon.maxUses) {
                return handleError(res, 400, 'Coupon usage limit has been reached');
            }

            // Check if the user has already used the coupon (if logged in)
            if (req.cookies.accessToken) {
                const token = req.cookies.accessToken;
                const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
                req.user = await User.findById(decoded.id).select('-password');

                if (req.user && coupon.maxUsesPerUser) {
                    const userOrderCount = await Order.countDocuments({ user: req.user._id, couponUsed: coupon._id });
                    if (userOrderCount >= coupon.maxUsesPerUser) {
                        return handleError(res, 400, 'You have already used this coupon the maximum number of times');
                    }
                }
            } else {
                return handleError(res, 401, 'You must be logged in to use a coupon');
            }

            // Calculate the discount
            if (coupon.discountType === 'percentage') {
                appliedDiscount = (subtotal * coupon.discountValue) / 100;
            } else if (coupon.discountType === 'fixed') {
                appliedDiscount = coupon.discountValue;
            }

            // Ensure the discount does not exceed the subtotal
            appliedDiscount = Math.min(appliedDiscount, subtotal);

            // Update coupon usage
            coupon.uses += 1;
            await coupon.save();

            couponUsed = coupon._id;
            // Calculate the final total
            const finalTotal = subtotal + shippingCost - appliedDiscount;

            // compare totalamount and finaltotla
            if (totalAmount !== finalTotal) {
                return handleError(res, 400, 'Invalid total amount');
            }
        }


        
        // Create order
        const order = new Order({
            items: orderItems,
            shippingAddress,
            paymentMethod,
            couponUsed: coupon ? coupon._id : null, // Use coupon._id if coupon is available, otherwise null
            subtotal,
            shippingCost,
            discount,
            totalAmount,
            user: req.user ? req.user._id : null, // Set user to null if not logged in
            email,
            phone,
            name
        });

       
        if (paymentMethod === 'PayFast') {
            // Build the required parameters for PayFast
            const payfastParams = {
                merchant_id: process.env.PAYFAST_MERCHANT_ID,
                merchant_key: process.env.PAYFAST_MERCHANT_KEY,
                return_url: process.env.PAYFAST_RETURN_URL,
                cancel_url: process.env.PAYFAST_CANCEL_URL,
                notify_url: process.env.PAYFAST_NOTIFY_URL,
                m_payment_id: order._id.toString(), // Use order ID as unique identifier
                amount: total.toFixed(2),           // Format amount with 2 decimals
                item_name: 'Order Payment'
            };

            // Include passphrase if set
            if (process.env.PAYFAST_PASSPHRASE) {
                payfastParams.passphrase = process.env.PAYFAST_PASSPHRASE;
            }

            // Build the signature string by sorting the keys and URL-encoding values
            let signatureString = '';
            Object.keys(payfastParams)
                .sort()
                .forEach((key) => {
                    if (payfastParams[key] !== '') {
                        signatureString += `${key}=${encodeURIComponent(payfastParams[key]).replace(/%20/g, '+')}&`;
                    }
                });
            // Remove the trailing ampersand
            signatureString = signatureString.slice(0, -1);

            // Generate the MD5 hash signature
            const signature = crypto.createHash('md5').update(signatureString).digest('hex');
            payfastParams.signature = signature;

            // Construct the final redirect URL for PayFast
            const payfastBaseUrl = process.env.PAYFAST_URL || 'https://sandbox.payfast.co.za/eng/process';
            const queryString = new URLSearchParams(payfastParams).toString();
            const paymentUrl = `${payfastBaseUrl}?${queryString}`;

            // Save the redirect URL in the order’s paymentResult field
            order.paymentResult = {
                id: '', // No payment ID from PayFast at this stage
                status: 'pending',
                update_time: new Date().toISOString(),
                // Custom field for storing the redirect URL:
                redirectUrl: paymentUrl
            };
        } else if (paymentMethod === 'Card') {
            // [Existing Card (Stripe) processing can remain here if you continue to support it]
        }

       
        await order.save();
       

        return handleResponse(res, 201, 'Order created successfully', order);
    } catch (error) {
        return handleError(res, 500, error.message);
    }
};


export const createOrder = async (req, res) => {
    try {
        const {
            items,
            shippingAddress,
            paymentMethod,
            couponCode,
            subtotal,
            shippingCost,
            discount,
            totalAmount
        } = req.body;

        
        // Basic validation
        if (!items || items.length === 0) {
            return handleError(res, 400, 'No order items specified');
        }

        if (!shippingAddress?.email || !shippingAddress?.phone || !shippingAddress?.fullName) {
            return handleError(res, 400, 'Shipping address requires email, phone, and full name');
        }

        // Validate totals match (you should ideally recalculate these server-side)
        const calculatedTotal = subtotal + shippingCost - discount;
        if (totalAmount !== calculatedTotal) {
            return handleError(res, 400, 'Invalid total amount');
        }

        // Check coupons for authenticated users only
        const user = req.user;
        if (couponCode && !user) {
            return handleError(res, 400, 'Coupons require user login');
        }

        // Process products and stock
        const productIds = items.map(item => item.id);
        const products = await Product.find({ _id: { $in: productIds } });

        let orderTotal = 0;
        const orderItems = [];

        for (const item of items) {
            const product = products.find(p => p._id.toString() === item.id);
            if (!product) return handleError(res, 404, `Product not found: ${item.id}`);
            if (product.stock < item.quantity) {
                return handleError(res, 400,
                    `Insufficient stock for ${product.name}. Available: ${product.stock}`);
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
        }

        // Create order
        const order = new Order({
            items: orderItems,
            shippingAddress,
            paymentMethod,
            subtotal,
            shippingCost,
            discount,
            totalAmount,
            user: user?._id || null,
            couponUsed: null // Simplified coupon handling (see note below)
        });

        await order.save();

        // Send email to guest users
        if (!user) {
            await sendGuestOrderConfirmation(order);
        }

        return handleResponse(res, 201, 'Order created successfully', order);

    } catch (error) {
        return handleError(res, 500, error.message);
    }
};

// Email helper function
const sendGuestOrderConfirmation = async (order) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: order.shippingAddress.email,
            subject: 'Order Confirmation',
            html: `
                <h1>Thank you for your order!</h1>
                <p>Order ID: ${order._id}</p>
                <h3>Order Details:</h3>
                <ul>
                    ${order.items.map(item => `
                        <li>
                            ${item.name} - 
                            Quantity: ${item.quantity} - 
                            Price: $${item.price}
                        </li>
                    `).join('')}
                </ul>
                <p>Total Amount: $${order.totalAmount}</p>
                <p>We'll notify you when your order status updates.</p>
            `
        };

        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Failed to send confirmation email:', error);
    }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
export const getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email')
            .populate('items.product', 'name images');

        if (!order) {
            return handleError(res, 404, 'Order not found');
        }

        // Authorization check
        if (order.user?.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return handleError(res, 403, 'Not authorized to view this order');
        }

        handleResponse(res, 200, 'Order details retrieved', order);

    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Get logged-in user orders
// @route   GET /api/orders/my-orders
// @access  Private
export const getUserOrders = async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user._id })
            .sort('-createdAt')
            .populate('items.product', 'name images');

        handleResponse(res, 200, 'User orders retrieved', orders);

    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Get all orders (Admin)
// @route   GET /api/orders
// @access  Admin
export const getAllOrders = async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        const filter = status ? { status } : {};

        const orders = await Order.find(filter)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort('-createdAt')
            .populate('user', 'name email');

        const count = await Order.countDocuments(filter);

        handleResponse(res, 200, 'All orders retrieved', {
            orders,
            totalPages: Math.ceil(count / limit),
            currentPage: page
        });

    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Update order status (Admin)
// @route   PUT /api/orders/:id/status
// @access  Admin
export const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['Processing', 'Shipped', 'Delivered', 'Cancelled'];

        if (!validStatuses.includes(status)) {
            return handleError(res, 400, 'Invalid order status');
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return handleError(res, 404, 'Order not found');
        }

        order.status = status;
        if (status === 'Delivered') order.deliveredAt = Date.now();
        if (status === 'Cancelled') await restoreStock(order.items);

        await order.save();

        handleResponse(res, 200, 'Order status updated', order);

    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Create payment intent
// @route   POST /api/orders/create-payment-intent
// @access  Private
export const createPaymentIntent = async (req, res) => {
    try {
        const { amount } = req.body;

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100),
            currency: 'usd',
            metadata: { userId: req.user._id.toString() }
        });

        handleResponse(res, 200, 'Payment intent created', {
            clientSecret: paymentIntent.client_secret
        });

    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// Helper: Restore product stock when order is cancelled
const restoreStock = async (items) => {
    const stockUpdates = items.map(item => ({
        updateOne: {
            filter: { _id: item.product },
            update: { $inc: { stock: item.quantity } }
        }
    }));

    await Product.bulkWrite(stockUpdates);
};

export const payfastNotify = async (req, res) => {
    try {
        // The ITN data comes as form-encoded data in req.body.
        const data = { ...req.body };

        // Save the received signature and then remove it from data for verification.
        const receivedSignature = data.signature;
        delete data.signature;

        // Rebuild the signature string:
        // Sort the keys and build a query string in the same way as when you generated the signature
        let signatureString = '';
        Object.keys(data)
            .sort()
            .forEach((key) => {
                // Skip empty values if necessary
                if (data[key] !== '') {
                    signatureString += `${key}=${encodeURIComponent(data[key]).replace(/%20/g, '+')}&`;
                }
            });

        // If you use a passphrase, append it.
        if (process.env.PAYFAST_PASSPHRASE) {
            // Note: Some implementations append the passphrase as:
            signatureString += `passphrase=${encodeURIComponent(process.env.PAYFAST_PASSPHRASE).replace(/%20/g, '+')}`;
        } else {
            // Otherwise, remove trailing '&'
            signatureString = signatureString.slice(0, -1);
        }

        // Generate the expected signature using MD5
        const expectedSignature = crypto
            .createHash('md5')
            .update(signatureString)
            .digest('hex');

        // Compare signatures
        if (expectedSignature !== receivedSignature) {
            return res.status(400).send('Signature mismatch');
        }

        // Find the order by using the m_payment_id field (which we set to our order _id)
        const orderId = data.m_payment_id;
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).send('Order not found');
        }

        // Process the payment status
        // For example, PayFast might send payment_status = "COMPLETE" for a successful payment
        if (data.payment_status === 'COMPLETE') {
            order.status = 'Processing'; // or whatever status you use for a paid order
        } else if (data.payment_status === 'FAILED') {
            order.status = 'Cancelled';
            // Optionally, restore product stock here
        } else {
            // You might want to handle other statuses if applicable
            order.status = data.payment_status;
        }

        // Optionally update other fields from the ITN callback:
        order.paymentResult = {
            ...order.paymentResult,
            pf_payment_id: data.pf_payment_id, // PayFast payment id
            status: data.payment_status,
            update_time: new Date().toISOString(),
            // Include any other fields from the ITN payload as desired
        };

        // Save the updated order
        await order.save();

        // Respond with HTTP 200 to let PayFast know that the ITN was processed successfully
        return res.sendStatus(200);
    } catch (error) {
        return handleError(res, 500, error.message);
    }
};


/*
Key Features:
1. Order Processing:
   - Guest checkout support
   - Real-time stock management
   - Coupon validation and tracking
   - Payment intent creation
   - Email notifications

2. Security:
   - User order authorization
   - Payment metadata tracking
   - Stock restoration on cancellation
   - Input validation

3. Business Logic:
   - Multi-step order validation
   - Bulk stock updates
   - Paginated order listing
   - Status transition handling

4. Error Handling:
   - Insufficient stock checks
   - Invalid coupon handling
   - Order not found scenarios
   - Payment processing errors

Response Examples:
1. Successful Order Creation:
{
  "status": 201,
  "success": true,
  "message": "Order created successfully",
  "data": {
    "_id": "65a1b...",
    "totalAmount": 59.99,
    "status": "Processing",
    "paymentMethod": "Card"
  }
}

2. Order Status Update:
{
  "status": 200,
  "success": true,
  "message": "Order status updated",
  "data": {
    "status": "Shipped",
    "deliveredAt": null
  }
}

3. Payment Intent:
{
  "status": 200,
  "success": true,
  "message": "Payment intent created",
  "data": {
    "clientSecret": "pi_3Oe..."
  }
}
*/