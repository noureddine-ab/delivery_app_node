const bcrypt = require('bcrypt');
const pool = require('../database');
const validator = require('validator');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Configure Mailtrap transporter
const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST,
    port: process.env.MAILTRAP_PORT,
    auth: {
        user: process.env.MAILTRAP_USER,
        pass: process.env.MAILTRAP_PASS,
    },
});

const authController = {
    signup: async (req, res) => {
        try {
            const { name, email, password, phone, location, role } = req.body;

            // Validate input
            if (!name || !email || !password || !phone || !location || !role) {
                return res.status(400).json({ error: 'All fields are required' });
            }

            if (!validator.isEmail(email)) {
                return res.status(400).json({ error: 'Invalid email format' });
            }

            if (!['Client', 'Delivery Man'].includes(role)) {
                return res.status(400).json({ error: 'Invalid role specified' });
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
             (name, email, password_hash, phone, location, role, verification_token, verification_token_expiry) 
             VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
                [name, email, hashedPassword, phone, location, role, verificationToken]
            );

            // Send verification email
            const verificationLink = `http://192.168.1.4:3000/api/auth/verify-email?token=${verificationToken}`;
            await transporter.sendMail({
                from: 'noreply@demomailtrap.co',
                to: email,
                subject: 'Verify Your Email',
                html: `Click <a href="${verificationLink}">here</a> to verify your email.`,
            });

            // Return the verification token in the response
            res.status(201).json({
                message: 'Registration successful. Please check your email to verify your account.',
                verificationToken: verificationToken, // Add this line
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
             (name, email, password_hash, phone, location, role, is_verified) 
             VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
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
};

module.exports = authController;