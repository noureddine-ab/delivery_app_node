const bcrypt = require('bcrypt');
const pool = require('../database');
const validator = require('validator');

const authController = {
    // Signup Logic
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

            // Check if email exists
            const [existingUser] = await pool.query(
                'SELECT email FROM users WHERE email = ?',
                [email]
            );

            if (existingUser.length > 0) {
                return res.status(409).json({ error: 'Email already registered' });
            }

            // Hash password
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Insert new user
            const [result] = await pool.query(
                `INSERT INTO users 
         (name, email, password_hash, phone, location, role)
         VALUES (?, ?, ?, ?, ?, ?)`,
                [name, email, hashedPassword, phone, location, role]
            );

            res.status(201).json({
                message: 'User registered successfully',
                userId: result.insertId,
            });
        } catch (error) {
            console.error('Signup error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // Login Logic
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