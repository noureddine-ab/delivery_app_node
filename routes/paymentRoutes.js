const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// POST endpoint for payment initiation
router.post('/initiate', paymentController.initiatePayment);

// Webhook endpoints - handle both GET and POST
router.get('/webhook', paymentController.handleWebhook);
router.post('/webhook', paymentController.handleWebhook);

// Callback endpoints
router.get('/callback/:orderId', paymentController.handleCallback);
router.get('/cancel/:orderId', paymentController.handleCancel);

// Payment status check endpoint
router.get('/status/:orderId', paymentController.getPaymentStatus);

module.exports = router;