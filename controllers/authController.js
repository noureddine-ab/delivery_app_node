const bcrypt = require('bcrypt');
const pool = require('../database');
const validator = require('validator');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const moment = require('moment-timezone');

// Configure Gmail transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_EMAIL, // Your Gmail address
        pass: process.env.GMAIL_PASSWORD, // Your Gmail password or app password
    },
});

const authController = {
    signup: async (req, res) => {
        try {
            const { name, email, password, phone, location } = req.body;

            // Validate input
            if (!name || !email || !password || !phone || !location ) {
                return res.status(400).json({ error: 'All fields are required' });
            }

            if (!validator.isEmail(email)) {
                return res.status(400).json({ error: 'Invalid email format' });
            }

            // Check if email exists in either unverified_users or users table
            const [existingUser] = await pool.query(
                `SELECT email FROM unverified_users WHERE email = ?
                 UNION
                 SELECT email FROM users WHERE email = ?`,
                [email, email]
            );

            if (existingUser.length > 0) {
                return res.status(409).json({ error: 'Email already registered' });
            }

            // Hash password
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Generate verification token
            const verificationToken = crypto.randomBytes(20).toString('hex');

            // Insert new user into unverified_users table
            const [result] = await pool.query(
                `INSERT INTO unverified_users 
                 (name, email, password_hash, phone, location,  verification_token, verification_token_expiry) 
                 VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
                [name, email, hashedPassword, phone, location, verificationToken]
            );

            // Send verification email
            const verificationLink = `http://192.168.1.4:3000/api/auth/verify-email?token=${verificationToken}`;
            await transporter.sendMail({
                from: process.env.GMAIL_EMAIL, // Sender email
                to: email, // Recipient email
                subject: 'Verify Your Email',
                html: `Click <a href="${verificationLink}">here</a> to verify your email.`,
            });

            res.status(201).json({
                message: 'Registration successful. Please check your email to verify your account.',
            });
        } catch (error) {
            console.error('Signup error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    verifyEmail: async (req, res) => {
        try {
            const { token } = req.query;

            // Check if token is valid and not expired
            const [unverifiedUsers] = await pool.query(
                'SELECT * FROM unverified_users WHERE verification_token = ? AND verification_token_expiry > NOW()',
                [token]
            );

            if (unverifiedUsers.length === 0) {
                return res.status(400).json({ error: 'Invalid or expired token' });
            }

            const unverifiedUser = unverifiedUsers[0];

            // Move user from unverified_users to users table
            await pool.query(
                `INSERT INTO users 
                 (name, email, password_hash, phone, location, is_verified) 
                 VALUES (?, ?, ?, ?, ?, TRUE)`,
                [unverifiedUser.name, unverifiedUser.email, unverifiedUser.password_hash, unverifiedUser.phone, unverifiedUser.location, unverifiedUser.role]
            );

            // Delete the user from unverified_users table
            await pool.query(
                'DELETE FROM unverified_users WHERE id = ?',
                [unverifiedUser.id]
            );

            res.json({ message: 'Email verified successfully. You can now log in.' });
        } catch (error) {
            console.error('Email verification error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    checkVerificationStatus: async (req, res) => {
        try {
            const { email } = req.query;

            // Check if the user exists in the users table and is verified
            const [users] = await pool.query(
                'SELECT * FROM users WHERE email = ? AND is_verified = TRUE',
                [email]
            );

            if (users.length > 0) {
                res.json({ isVerified: true });
            } else {
                res.json({ isVerified: false });
            }
        } catch (error) {
            console.error('Verification status check error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    login: async (req, res) => {
        try {
            const { email, password } = req.body;

            // Validate input
            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }

            // Find user by email
            const [users] = await pool.query(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );

            if (users.length === 0) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const user = users[0];

            // Check if email is verified
            if (!user.is_verified) {
                return res.status(403).json({ error: 'Email not verified. Please check your email.' });
            }

            // Compare passwords
            const passwordMatch = await bcrypt.compare(password, user.password_hash);

            if (!passwordMatch) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Login successful
            res.json({
                message: 'Login successful',
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    location: user.location,
                    role: user.role,
                },
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    resetPassword: async (req, res) => {
        try {
            const { email, newPassword } = req.body;

            // Validate input
            if (!email || !newPassword) {
                return res.status(400).json({ error: 'Email and new password are required' });
            }

            // Check if user exists
            const [users] = await pool.query(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );

            if (users.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Hash the new password
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

            // Update the user's password
            await pool.query(
                'UPDATE users SET password_hash = ? WHERE email = ?',
                [hashedPassword, email]
            );

            res.json({ message: 'Password reset successful' });
        } catch (error) {
            console.error('Reset password error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    forgotPassword: async (req, res) => {
        try {
            const { email } = req.body;

            // Validate input
            if (!email) {
                return res.status(400).json({ error: 'Email is required' });
            }

            if (!validator.isEmail(email)) {
                return res.status(400).json({ error: 'Invalid email format' });
            }

            // Check if the user exists
            const [users] = await pool.query(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );

            if (users.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            const user = users[0];

            // Generate OTP
            const otp = crypto.randomInt(100000, 999999).toString(); // 6-digit OTP
            const otpExpiry = new Date(Date.now() + 10 * 60 * 1000 + 60*60*1000); // OTP expires in 10 minutes
            console.log(otpExpiry)

            // Format the datetime for MySQL
            const formattedOtpExpiry = otpExpiry.toISOString().slice(0, 19).replace('T', ' ');

            // Store OTP and expiry in the database
            await pool.query(
                'UPDATE users SET reset_password_otp = ?, reset_password_otp_expiry = ? WHERE id = ?',
                [otp, formattedOtpExpiry, user.id]
            );

            // Send OTP to the user's email
            await transporter.sendMail({
                from: process.env.GMAIL_EMAIL,
                to: email,
                subject: 'Password Reset OTP',
                html: `Your OTP for password reset is: <strong>${otp}</strong>. This OTP is valid for 10 minutes.`,
            });

            res.json({ message: 'OTP sent to your email. Please check your inbox.' });
        } catch (error) {
            console.error('Forgot password error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    confirmPassword: async (req, res) => {
        try {
            const { email, otp, newPassword } = req.body;

            // Validate input
            if (!email || !otp || !newPassword) {
                return res.status(400).json({ error: 'Email, OTP, and new password are required' });
            }

            if (!validator.isEmail(email)) {
                return res.status(400).json({ error: 'Invalid email format' });
            }

            // Check if the user exists
            const [users] = await pool.query(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );

            if (users.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            const user = users[0];

            // Check if OTP matches and is not expired
            if (user.reset_password_otp !== otp || new Date(user.reset_password_otp_expiry) < new Date()) {
                return res.status(400).json({ error: 'Invalid or expired OTP' });
            }

            // Hash the new password
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

            // Update the user's password and clear OTP fields
            await pool.query(
                'UPDATE users SET password_hash = ?, reset_password_otp = NULL, reset_password_otp_expiry = NULL WHERE id = ?',
                [hashedPassword, user.id]
            );

            res.json({ message: 'Password reset successful. You can now log in with your new password.' });
        } catch (error) {
            console.error('Confirm password error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
};

module.exports = authController;