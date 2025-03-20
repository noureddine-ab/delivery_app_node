const express = require('express');
const router = express.Router();
const { upload, estimatePrice } = require('../controllers/deliveryController');

router.post('/estimate-price', upload.single('image'), estimatePrice);

module.exports = router;