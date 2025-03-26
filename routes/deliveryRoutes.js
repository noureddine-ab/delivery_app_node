// routes/deliveryRoutes.js
const express = require('express');
const router = express.Router();
const {
    upload,
    estimatePrice,
    cancelDelivery,
    getNearestDrivers,
    trackDelivery,
    updateDeliveryStatus,
} = require('../controllers/deliveryController');


router.post('/estimate-price', upload.single('image'), estimatePrice);

router.post('/cancel-delivery', cancelDelivery);

router.get('/nearest-drivers', getNearestDrivers);

router.get('/:deliveryId', trackDelivery);

router.post('/:deliveryId/update-status', updateDeliveryStatus);

module.exports = router;