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

const order = async (req, res) => {
    try {
        // Validate required fields
        const requiredFields = ['customerId', 'objectType', 'source', 'destination', 'shippingDate'];
        const missingFields = requiredFields.filter(field => !req.body[field]);

        if (missingFields.length > 0) {
            return res.status(400).json({
                error: 'Missing required fields',
                missingFields
            });
        }

        const { customerId, objectType, source, destination, shippingDate, description } = req.body;
        const imagePath = req.file ? path.join('uploads', req.file.filename) : null;

        // Validate customerId exists in database
        const [userCheck] = await pool.query('SELECT id FROM users WHERE id = ?', [customerId]);
        if (userCheck.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        // Validate shipping date
        const shippingDateObj = new Date(shippingDate);
        if (isNaN(shippingDateObj.getTime())) {
            return res.status(400).json({ error: 'Invalid shipping date' });
        }

        await pool.query('START TRANSACTION');

        try {
            // Create order
            const [orderResult] = await pool.query(
                `INSERT INTO customerorder 
                (date, status, total, customer_id, payment_method, source, destination)
                VALUES (NOW(), 'pending', 0, ?, NULL, ?, ?)`,
                [customerId, source, destination]
            );

            const orderId = orderResult.insertId;

            // Add product
            await pool.query(
                `INSERT INTO product 
                (object_type, price, description, customer_order_id, image_path)
                VALUES (?, 0, ?, ?, ?)`,
                [objectType, description, orderId, imagePath]
            );

            // Create delivery
            const [deliveryResult] = await pool.query(
                `INSERT INTO delivery 
                (order_id, shipping_date, status)
                VALUES (?, ?, 'pending')`,
                [orderId, shippingDate]
            );

            await pool.query('COMMIT');

            res.status(201).json({
                success: true,
                orderId,
                deliveryId: deliveryResult.insertId,
                imagePath
            });

        } catch (error) {
            await pool.query('ROLLBACK');
            console.error('Transaction error:', error);
            res.status(500).json({ error: 'Order processing failed' });
        }
    } catch (error) {
        console.error('Order creation failed:', error);
        res.status(500).json({
            error: 'Order creation failed',
            details: process.env.NODE_ENV === 'development' ? error.message : null
        });
    }
};

const cancelDelivery = async (req, res) => {
    try {
        const { deliveryId } = req.body;

        if (!deliveryId || isNaN(deliveryId)) {
            return res.status(400).json({ error: 'Invalid order ID' });
        }

        // Update both order and delivery status
        await pool.query('START TRANSACTION');
        try {
            await pool.query('CALL UpdateDeliveryStatus(?, ?)', [deliveryId, 'cancelled']);

            await pool.query(`
                UPDATE delivery 
                SET status = 'failed' 
                WHERE order_id = ?
            `, [deliveryId]);

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
                user_id, 
                u.name, 
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
            FROM drivers , users u
            WHERE is_available = TRUE && u.id=drivers.user_id
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
        const { deliveryId } = req.params;

        const [results] = await pool.query(`
            SELECT 
                d.order_id,
                d.status AS current_status,
                d.shipping_date,
                d.updated_at,
                d.status_history,
                p.object_type,
                p.image_path,
                co.source AS source,
                co.destination AS destination
            FROM delivery d
            JOIN product p ON d.order_id = p.customer_order_id
            JOIN customerorder co ON d.order_id = co.id
            WHERE d.order_id = ?
        `, [deliveryId]);

        if (results.length === 0) {
            return res.status(404).json({ error: 'Delivery not found' });
        }

        const delivery = results[0];

        // Parse status history
        let statusHistory = [];
        if (delivery.status_history) {
            try {
                statusHistory = JSON.parse(`[${delivery.status_history.slice(0, -1)}]`);
            } catch (e) {
                console.error('Error parsing status history:', e);
                statusHistory = []; // Fallback to empty array
            }
        }

        res.json({
            deliveryId: delivery.order_id,
            currentStatus: delivery.current_status,
            objectType: delivery.object_type,
            imagePath: delivery.image_path,
            source: delivery.source,
            destination: delivery.destination,
            shippingDate: delivery.shipping_date,
            lastUpdated: delivery.updated_at,
            statusHistory: statusHistory
        });

    } catch (error) {
        console.error('Error tracking delivery:', error);
        res.status(500).json({ error: 'Failed to track delivery' });
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

const searchDrivers = async (req, res) => {
    try {
        const { source, destination, vehicleType } = req.query;

        // Simple validation
        if (!source) {
            return res.status(400).json({ error: 'Source location is required' });
        }

        // Corrected query matching your database schema
        const [drivers] = await pool.query(`
            SELECT 
                u.id, 
                u.name, 
                u.phone,
                d.vehicle_type,
                d.rating,
                d.service_area
            FROM drivers d
            JOIN users u ON d.user_id = u.id
            WHERE d.is_available = TRUE
            AND d.service_area LIKE ?
            ${vehicleType && vehicleType !== 'all' ? 'AND d.vehicle_type = ?' : ''}
            ORDER BY d.rating DESC
            LIMIT 20
        `, [
            `%${source}%`,
            ...(vehicleType && vehicleType !== 'all' ? [vehicleType] : [])
        ]);

        // Format response to match Flutter expectations
        const formattedDrivers = drivers.map(driver => ({
            id: driver.id,
            name: driver.name,
            phone: driver.phone,
            vehicleType: driver.vehicle_type,
            rating: driver.rating,
            serviceArea: driver.service_area,
            canDeliverToDestination: destination
                ? driver.service_area.toLowerCase().includes(destination.toLowerCase())
                : true
        }));

        res.status(200).json(formattedDrivers);
    } catch (error) {
        console.error('Error searching drivers:', error);
        res.status(500).json({
            error: 'Failed to search drivers',
            details: process.env.NODE_ENV === 'development' ? error.message : null
        });
    }
};

const getAllDrivers = async (req, res) => {
    try {
        const [drivers] = await pool.query(`
            SELECT 
                u.id, 
                u.name, 
                u.phone,
                d.vehicle_type,
                d.rating,
                d.service_area
            FROM drivers d
            JOIN users u ON d.user_id = u.id
            WHERE d.is_available = TRUE
            ORDER BY d.rating DESC
            LIMIT 50
        `);

        const formattedDrivers = drivers.map(driver => ({
            id: driver.id,
            name: driver.name,
            phone: driver.phone,
            vehicleType: driver.vehicle_type,
            rating: driver.rating,
            serviceArea: driver.service_area
        }));

        res.status(200).json(formattedDrivers);
    } catch (error) {
        console.error('Error fetching all drivers:', error);
        res.status(500).json({ error: 'Failed to fetch drivers' });
    }
};

const getUserOrders = async (req, res) => {
    try {
        const { customerId } = req.params;

        const query = `
  SELECT 
    co.id AS order_id,
    co.date,
    co.source,
    co.destination,
    co.status AS order_status,
    p.object_type,
    dl.status AS delivery_status,
    p.description,
    p.image_path
  FROM customerorder co
  LEFT JOIN product p ON co.id = p.customer_order_id
  LEFT JOIN delivery dl ON co.id = dl.order_id
  WHERE co.customer_id = ?
  ORDER BY co.date DESC
`;
        const [orders] = await pool.execute(query, [customerId]);
        res.json(orders);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
};

const getInTransitOrders = async (req, res) => {
    try {
        const { customerId } = req.params;

        const query = `
            SELECT 
                co.id AS order_id,
                co.date,
                co.source,
                co.destination,
                co.total,
                p.object_type,
                p.description,
                p.image_path,
                d.status AS delivery_status
            FROM customerorder co
            JOIN product p ON co.id = p.customer_order_id
            JOIN delivery d ON co.id = d.order_id
            WHERE co.customer_id = ?
            AND d.status = 'in_transit'
            ORDER BY co.date DESC
        `;

        const [orders] = await pool.query(query, [customerId]);

        res.status(200).json(orders.map(order => ({
            id: order.order_id,
            date: order.date,
            source: order.source,
            destination: order.destination,
            total: order.total,
            objectType: order.object_type,
            description: order.description,
            imagePath: order.image_path,
            status: order.delivery_status
        })));

    } catch (error) {
        console.error('Error fetching in-transit orders:', error);
        res.status(500).json({
            error: 'Failed to fetch in-transit orders',
            details: process.env.NODE_ENV === 'development' ? error.message : null
        });
    }
};

module.exports = {
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
};