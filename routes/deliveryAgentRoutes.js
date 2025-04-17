const express = require('express');
const router = express.Router();
const { getPendingOrders } = require('../controllers/deliveryAgentController');

router.get('/orders', getPendingOrders);

module.exports = router;