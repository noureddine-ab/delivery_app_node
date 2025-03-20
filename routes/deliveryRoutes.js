// routes/deliveryRoutes.js
const express = require('express');
const router = express.Router();
const {
    upload,
    estimatePrice,
    cancelDelivery // Add this line
} = require('../controllers/deliveryController'); // Correct import

// Existing route
router.post('/estimate-price', upload.single('image'), estimatePrice);

// New route for cancellation
router.post('/cancel-delivery', cancelDelivery); // ✅ Fixed

module.exports = router;