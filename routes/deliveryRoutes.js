// routes/deliveryRoutes.js
const express = require('express');
const router = express.Router();
const {
    upload,
    order,
    cancelDelivery,
    getNearestDrivers,
    trackDelivery,
    updateDeliveryStatus,
    searchDrivers,
    getAllDrivers,
    getUserOrders,
    getInTransitOrders,
} = require('../controllers/deliveryController');


router.post('/order', upload.single('image'), order);

router.post('/cancel-delivery', cancelDelivery);

router.get('/nearest-drivers', getNearestDrivers);

router.get('/:deliveryId', trackDelivery);

router.post('/:deliveryId/update-status', updateDeliveryStatus);

router.get('/drivers/search', searchDrivers);

router.get('/drivers/all', getAllDrivers);

router.get('/user-orders/:customerId', getUserOrders);

router.get('/:customerId/in-transit', getInTransitOrders);

module.exports = router;