const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

// Signup Route
router.post('/signup', authController.signup);

// Login Route
router.post('/login', authController.login);

// Reset Password Route
router.post('/reset-password', authController.resetPassword);

// Verify Email Route
router.get('/verify-email', authController.verifyEmail);

// Check Verification Status Route
router.get('/check-verification-status', authController.checkVerificationStatus);

module.exports = router;