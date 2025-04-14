const multer = require('multer');
const pool = require('../database');
const path = require('path');
const fs = require('fs');

// Ensure "uploads" directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    },
});

const upload = multer({ storage });

const estimatePrice = async (req, res) => {
    try {
        const { objectType, source, destination, shippingDate, customerId } = req.body;
        const imagePath = req.file ? path.join('uploads', req.file.filename) : null;

        // Start transaction
        await pool.query('START TRANSACTION');

        try {
            // 1. Create the order
            const [orderResult] = await pool.query(`
                INSERT INTO customerorder (date, status, total, customer_id, payment_method)
                VALUES (NOW(), 'pending', 0, ?, NULL)
            `, [customerId]);

            const orderId = orderResult.insertId;

            // 2. Add product to the order
            const [productResult] = await pool.query(`
                INSERT INTO product (object_type, price, description, customer_order_id, image_path)
                VALUES (?, 0, NULL, ?, ?)
            `, [objectType, orderId, imagePath]);

            // 3. Create delivery record
            const [deliveryResult] = await pool.query(`
                INSERT INTO delivery (order_id, longitude, latitude, shipping_date, status, driver_id)
                VALUES (?, 0, 0, ?, 'pending', 0)
            `, [orderId, shippingDate]);

            await pool.query('COMMIT');

            res.status(200).json({
                message: 'Order and delivery created successfully',
                orderId: orderId,
                deliveryId: deliveryResult.insertId
            });
        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
};

const cancelDelivery = async (req, res) => {
    try {
        const { orderId } = req.body;

        if (!orderId || isNaN(orderId)) {
            return res.status(400).json({ error: 'Invalid order ID' });
        }

        // Update both order and delivery status
        await pool.query('START TRANSACTION');
        try {
            await pool.query(`
                UPDATE customerorder 
                SET status = 'cancelled' 
                WHERE id = ?
            `, [orderId]);

            await pool.query(`
                UPDATE delivery 
                SET status = 'failed' 
                WHERE order_id = ?
            `, [orderId]);

            await pool.query('COMMIT');
            res.status(200).json({ message: 'Order and delivery cancelled successfully' });
        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ error: 'Failed to cancel order' });
    }
};

// Get nearest available drivers
const getNearestDrivers = async (req, res) => {
    try {
        const { latitude, longitude } = req.query;

        // Validate coordinates
        if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({ error: 'Invalid coordinates' });
        }

        const radius = 10; // 10km radius

        const [drivers] = await pool.query(`
            SELECT 
                id, 
                name, 
                phone, 
                vehicle_type,
                rating,
                latitude,
                longitude,
                (6371 * ACOS(
                    COS(RADIANS(?)) * COS(RADIANS(latitude)) * 
                    COS(RADIANS(longitude) - RADIANS(?)) + 
                    SIN(RADIANS(?)) * SIN(RADIANS(latitude))
                )) AS distance_km
            FROM drivers
            WHERE is_available = TRUE
            HAVING distance_km < ?
            ORDER BY distance_km
            LIMIT 20
        `, [latitude, longitude, latitude, radius]);

        // Ensure numeric values are properly formatted
        const formattedDrivers = drivers.map(driver => ({
            ...driver,
            latitude: parseFloat(driver.latitude),
            longitude: parseFloat(driver.longitude),
            distance_km: parseFloat(driver.distance_km)
        }));

        res.status(200).json(formattedDrivers);
    } catch (error) {
        console.error('Error fetching drivers:', error);
        res.status(500).json({ error: 'Failed to fetch drivers' });
    }
};

const trackDelivery = async (req, res) => {
    try {
        const { orderId } = req.params;

        const [results] = await pool.query(`
            SELECT 
                co.id AS order_id,
                co.status AS order_status,
                co.total,
                d.id AS delivery_id,
                d.status AS delivery_status,
                d.shipping_date,
                d.updated_at,
                p.object_type,
                p.image_path
            FROM customerorder co
            JOIN delivery d ON co.id = d.order_id
            JOIN product p ON co.id = p.customer_order_id
            WHERE co.id = ?
        `, [orderId]);

        if (results.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = results[0];

        res.json({
            orderId: order.order_id,
            orderStatus: order.order_status,
            deliveryId: order.delivery_id,
            deliveryStatus: order.delivery_status,
            objectType: order.object_type,
            imagePath: order.image_path,
            shippingDate: order.shipping_date,
            lastUpdated: order.updated_at
        });

    } catch (error) {
        console.error('Error tracking order:', error);
        res.status(500).json({ error: 'Failed to track order' });
    }
};

const updateDeliveryStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { newStatus } = req.body;

        // Update delivery status
        await pool.query(`
            UPDATE delivery 
            SET 
                status = ?,
                updated_at = NOW()
            WHERE order_id = ?
        `, [newStatus, orderId]);

        // If delivered, also update order status
        if (newStatus === 'delivered') {
            await pool.query(`
                UPDATE customerorder 
                SET status = 'delivered'
                WHERE id = ?
            `, [orderId]);
        }

        res.json({
            success: true,
            newStatus,
            updatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error updating delivery status:', error);
        res.status(500).json({ error: 'Failed to update delivery status' });
    }
};

module.exports = {
    upload,
    estimatePrice,
    cancelDelivery,
    getNearestDrivers,
    trackDelivery,
    updateDeliveryStatus,
};