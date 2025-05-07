require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');
const userMangementRoutes = require('./routes/userManagementRoutes');
const deliveryAgentRoutes = require('./routes/deliveryAgentRoutes');
const dashboardRoutes = require('./routes/dashboard');

const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/users', userMangementRoutes);
app.use('/api/delivery-agent', deliveryAgentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health Check Endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// Start Server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});