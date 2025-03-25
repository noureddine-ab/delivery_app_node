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

module.exports = {
    upload,
    estimatePrice,
    cancelDelivery,
    getNearestDrivers,
};