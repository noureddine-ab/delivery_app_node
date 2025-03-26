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
        const { objectType, source, destination, shippingDate } = req.body;
        const imagePath = req.file ? path.join('uploads', req.file.filename) : null;

        // Save to MySQL (removed estimated_price)
        const query = `
            INSERT INTO deliveries (object_type, source, destination, shipping_date, image_path)
            VALUES (?, ?, ?, ?, ?)
        `;
        const [queryResult] = await pool.query(query, [
            objectType,
            source,
            destination,
            shippingDate,
            imagePath
        ]);

        res.status(200).json({
            message: 'Delivery created successfully',
            deliveryId: queryResult.insertId
        });
    } catch (error) {
        console.error('Error creating delivery:', error);
        res.status(500).json({ error: 'Failed to create delivery' });
    }
};

const cancelDelivery = async (req, res) => {
    try {
        const { deliveryId } = req.body;

        if (!deliveryId || isNaN(deliveryId)) {
            return res.status(400).json({ error: 'Invalid delivery ID' });
        }
        const parsedId = parseInt(deliveryId, 10);

        const query = 'UPDATE deliveries SET status = ? WHERE id = ?';
        await pool.query(query, ['cancelled', parsedId]);

        res.status(200).json({ message: 'Delivery cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling delivery:', error);
        res.status(500).json({ error: 'Failed to cancel delivery' });
    }
};

// Get nearest available drivers
const getNearestDrivers = async (req, res) => {
    try {
        const { latitude, longitude } = req.query;
        const radius = 10; // 10km radius around Tunis

        const [drivers] = await pool.query(`
      SELECT 
        id, 
        name, 
        phone, 
        vehicle_type,
        rating,
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

        res.status(200).json(drivers);
    } catch (error) {
        console.error('Error fetching drivers:', error);
        res.status(500).json({ error: 'Failed to fetch drivers' });
    }
};

const trackDelivery = async (req, res) => {
    try {
        const { deliveryId } = req.params;

        const [delivery] = await pool.query(`
      SELECT 
        id,
        object_type,
        source,
        destination,
        status,
        status_history,
        shipping_date,
        updated_at
      FROM deliveries 
      WHERE id = ?
    `, [deliveryId]);

        if (delivery.length === 0) {
            return res.status(404).json({ error: 'Delivery not found' });
        }

        // Parse the status history or create empty array
        const statusHistory = delivery[0].status_history
            ? JSON.parse(delivery[0].status_history)
            : [
                {
                    status: 'pending',
                    timestamp: delivery[0].shipping_date.toISOString()
                }
            ];

        res.json({
            deliveryId: delivery[0].id,
            objectType: delivery[0].object_type,
            source: delivery[0].source,
            destination: delivery[0].destination,
            currentStatus: delivery[0].status,
            statusHistory: statusHistory,
            lastUpdated: delivery[0].updated_at
        });

    } catch (error) {
        console.error('Error tracking delivery:', error);
        res.status(500).json({ error: 'Failed to track delivery' });
    }
};

const updateDeliveryStatus = async (req, res) => {
    try {
        const { deliveryId } = req.params;
        const { newStatus } = req.body;

        // Get current delivery data
        const [delivery] = await pool.query('SELECT * FROM deliveries WHERE id = ?', [deliveryId]);

        if (delivery.length === 0) {
            return res.status(404).json({ error: 'Delivery not found' });
        }

        // Parse existing status history or initialize
        const currentHistory = delivery[0].status_history
            ? JSON.parse(delivery[0].status_history)
            : [
                {
                    status: 'pending',
                    timestamp: delivery[0].shipping_date.toISOString()
                }
            ];

        // Add new status change
        currentHistory.push({
            status: newStatus,
            timestamp: new Date().toISOString()
        });

        // Update the delivery
        await pool.query(`
      UPDATE deliveries 
      SET 
        status = ?,
        status_history = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [newStatus, JSON.stringify(currentHistory), deliveryId]);

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