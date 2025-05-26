const axios = require('axios');
const pool = require('../database');

const KONNECT_CONFIG = {
    API_KEY: '683098a28ec0718cdbb48096:AyEuLLpRTJG2VyDqjX9r9dEorm2Y',
    BASE_URL: 'https://api.preprod.konnect.network/api/v1',
    RECEIVER_WALLET_ID: '683098a28ec0718cdbb4809e'
};

exports.initiatePayment = async (req, res) => {
    try {
        const { orderId } = req.body;
        console.log('Initiating payment for order:', orderId);

        if (!orderId) {
            return res.status(400).json({
                success: false,
                error: 'Order ID is required'
            });
        }

        // Get order details with product information
        const [orderResult] = await pool.query(`
            SELECT 
                co.id,
                co.total,
                co.source,
                co.destination,
                u.name,
                u.email,
                u.phone,
                p.object_type,
                p.price as product_price
            FROM customerorder co
            JOIN users u ON co.customer_id = u.id
            LEFT JOIN product p ON co.id = p.customer_order_id
            WHERE co.id = ?
        `, [orderId]);

        if (orderResult.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        const orderData = orderResult[0];

        // Calculate total if it's 0 (use product price or set default)
        let amount = orderData.total;
        if (amount === 0 || amount === null) {
            amount = orderData.product_price || 50; // Default amount if no price set
        }

        // Split name properly
        const nameParts = orderData.name.trim().split(' ');
        const firstName = nameParts[0] || 'Customer';
        const lastName = nameParts.slice(1).join(' ') || 'User';

        // Get the server's external URL for webhook
        const protocol = req.secure ? 'https' : 'http';
        const host = req.get('host');
        const webhookUrl = `${protocol}://${host}/api/payment/webhook`;

        console.log('Webhook URL:', webhookUrl);
        console.log('Payment amount:', amount);

        // Prepare Konnect payload
        const paymentData = {
            receiverWalletId: KONNECT_CONFIG.RECEIVER_WALLET_ID,
            token: "TND",
            amount: Math.round(amount * 1000), // Convert to millimes
            type: "immediate",
            description: `Delivery Order #${orderId} - ${orderData.object_type}`,
            acceptedPaymentMethods: ["wallet", "bank_card", "e-DINAR"],
            lifespan: 30, // Extended to 30 minutes
            checkoutForm: true,
            addPaymentFeesToAmount: true,
            firstName: firstName,
            lastName: lastName,
            phoneNumber: orderData.phone,
            email: orderData.email,
            orderId: orderId.toString(),
            webhook: webhookUrl,
            silentWebhook: true,
            successUrl: `${protocol}://${host}/api/payment/callback/${orderId}?status=success`,
            failUrl: `${protocol}://${host}/api/payment/callback/${orderId}?status=failed`,
            theme: "dark"
        };

        console.log('Sending payment data to Konnect:', JSON.stringify(paymentData, null, 2));

        // Call Konnect API
        const response = await axios.post(
            `${KONNECT_CONFIG.BASE_URL}/payments/init-payment`,
            paymentData,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': KONNECT_CONFIG.API_KEY
                },
                timeout: 10000 // 10 second timeout
            }
        );

        console.log('Konnect API response:', response.data);

        // Store payment reference in database
        await pool.query(`
            UPDATE customerorder 
            SET payment_method = 'konnect',
                updated_at = NOW()
            WHERE id = ?
        `, [orderId]);

        res.json({
            success: true,
            paymentUrl: response.data.payUrl,
            paymentRef: response.data.paymentRef,
            amount: amount
        });

    } catch (error) {
        console.error('Payment initiation error:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });

        res.status(500).json({
            success: false,
            error: 'Payment initiation failed',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
        });
    }
};

exports.handleCallback = async (req, res) => {
    const orderId = req.params.orderId;
    const status = req.query.status;

    console.log('Payment callback received:', { orderId, status });

    try {
        // Add payment_status column check and update
        const updateQuery = `
            UPDATE customerorder 
            SET payment_method = 'konnect_completed',
                updated_at = NOW()
            WHERE id = ?
        `;

        await pool.query(updateQuery, [orderId]);

        // Also update delivery status if payment successful
        if (status === 'success') {
            await pool.query(`
                UPDATE delivery 
                SET status = 'assigned',
                    updated_at = NOW()
                WHERE order_id = ?
            `, [orderId]);
        }

        // Redirect back to app with status
        const redirectUrl = `yourapp://payment-complete?status=${status}&orderId=${orderId}`;
        res.redirect(redirectUrl);
    } catch (error) {
        console.error('Callback handling error:', error);
        res.redirect(`yourapp://payment-complete?status=error&orderId=${orderId}`);
    }
};

exports.handleCancel = async (req, res) => {
    const orderId = req.params.orderId;
    console.log('Payment cancelled for order:', orderId);

    try {
        await pool.query(`
            UPDATE customerorder 
            SET payment_method = 'cancelled',
                updated_at = NOW()
            WHERE id = ?
        `, [orderId]);

        res.redirect(`yourapp://payment-complete?status=cancelled&orderId=${orderId}`);
    } catch (error) {
        console.error('Cancel handling error:', error);
        res.redirect(`yourapp://payment-complete?status=error&orderId=${orderId}`);
    }
};

exports.handleWebhook = async (req, res) => {
    console.log('Webhook received:', {
        query: req.query,
        body: req.body,
        headers: req.headers
    });

    try {
        const paymentStatus = req.query.status || req.body.status;
        const orderId = req.query.orderId || req.body.orderId;

        if (!orderId) {
            console.error('No orderId in webhook');
            return res.status(400).json({ error: 'Missing orderId' });
        }

        const dbStatus = paymentStatus === 'SUCCESS' ? 'completed' : 'failed';

        await pool.query(`
            UPDATE customerorder 
            SET payment_method = ?,
                updated_at = NOW()
            WHERE id = ?
        `, [dbStatus, orderId]);

        // Update delivery status based on payment
        if (paymentStatus === 'SUCCESS') {
            await pool.query(`
                UPDATE delivery 
                SET status = 'assigned',
                    updated_at = NOW()
                WHERE order_id = ?
            `, [orderId]);
        }

        console.log(`Payment webhook processed: Order ${orderId} -> ${dbStatus}`);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
};

// Add payment status check endpoint
exports.getPaymentStatus = async (req, res) => {
    try {
        const orderId = req.params.orderId;

        const [result] = await pool.query(`
            SELECT 
                co.id,
                co.payment_method as paymentStatus,
                co.status as orderStatus,
                d.status as deliveryStatus
            FROM customerorder co
            LEFT JOIN delivery d ON co.id = d.order_id
            WHERE co.id = ?
        `, [orderId]);

        if (result.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json({
            orderId: orderId,
            paymentStatus: result[0].paymentStatus || 'pending',
            orderStatus: result[0].orderStatus,
            deliveryStatus: result[0].deliveryStatus
        });
    } catch (error) {
        console.error('Payment status check error:', error);
        res.status(500).json({ error: 'Failed to check payment status' });
    }
};