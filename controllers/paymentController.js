const axios = require('axios');
const crypto = require('crypto');
const pool = require('../database');

const initiatePayment = async (req, res) => {
    try {
        const { orderId } = req.body;

        // Validate input
        if (!orderId || isNaN(orderId)) {
            return res.status(400).json({
                error: 'Invalid order ID',
                details: 'Order ID must be a valid number'
            });
        }

        // Get order details
        const [order] = await pool.query(`
      SELECT co.id, co.total, co.customer_id, u.email, u.name 
      FROM customerorder co
      JOIN users u ON co.customer_id = u.id
      WHERE co.id = ?
    `, [orderId]);

        if (!order || order.length === 0) {
            return res.status(404).json({
                error: 'Order not found',
                details: `No order found with ID: ${orderId}`
            });
        }

        const orderData = order[0];
        const amountInMillimes = Math.round(orderData.total * 100);

        // Validate amount
        if (amountInMillimes <= 0) {
            return res.status(400).json({
                error: 'Invalid amount',
                details: `Calculated amount is invalid: ${amountInMillimes} millimes`
            });
        }

        const paymentData = {
            merchantId: process.env.KONNECT_MERCHANT_ID,
            amount: amountInMillimes,
            currency: "TND",
            customer: {
                email: orderData.email,
                name: orderData.name
            },
            metadata: {
                orderId: orderId,
                customerId: orderData.customer_id
            },
            methods: ["KNET", "AMEX", "MADA", "BENEFIT", "FAWRY"],
            successUrl: `${process.env.KONNECT_RETURN_URL}?success=true`,
            failUrl: `${process.env.KONNECT_RETURN_URL}?success=false`
        };

        console.log('Sending payment request to Konnect:', JSON.stringify(paymentData, null, 2));

        const response = await axios.post(
            'https://api.konnect.network/api/v2/payments/init',
            paymentData,
            {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'x-api-key': process.env.KONNECT_API_KEY
                },
                timeout: 10000 // 10 seconds timeout
            }
        );

        console.log('Konnect response:', response.data);

        // Update database
        await pool.query(
            `UPDATE customerorder SET payment_id = ? WHERE id = ?`,
            [response.data.id, orderId]
        );

        res.json({
            success: true,
            paymentUrl: response.data.paymentUrl,
            paymentId: response.data.id
        });

    } catch (error) {
        console.error('Payment initiation error:', error.response ? {
            status: error.response.status,
            data: error.response.data,
            headers: error.response.headers
        } : error.message);

        res.status(500).json({
            error: 'Payment initiation failed',
            details: process.env.NODE_ENV === 'production' ? null : {
                message: error.message,
                stack: error.stack,
                konnectResponse: error.response?.data
            }
        });
    }
};

module.exports = { initiatePayment };