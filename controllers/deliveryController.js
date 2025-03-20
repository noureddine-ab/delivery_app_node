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
        cb(null, uploadDir); // Use the correct path
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
        const estimatedPrice = 50.0;

        // Save to MySQL
        const query = `
      INSERT INTO deliveries (object_type, source, destination, shipping_date, image_path, estimated_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
        const [queryResult] = await pool.query(query, [
            objectType,
            source,
            destination,
            shippingDate,
            imagePath,
            estimatedPrice,
        ]);

        res.status(200).json({
            price: estimatedPrice,
            deliveryId: queryResult.insertId
        });
    } catch (error) {
        console.error('Error estimating price:', error);
        res.status(500).json({ error: 'Failed to estimate price' });
    }
};

const cancelDelivery = async (req, res) => {
    try {
        const { deliveryId } = req.body;

        // Validate and parse deliveryId
        if (!deliveryId || isNaN(deliveryId)) {
            return res.status(400).json({ error: 'Invalid delivery ID' });
        }
        const parsedId = parseInt(deliveryId, 10);

        // Update database
        const query = 'UPDATE deliveries SET status = ? WHERE id = ?';
        await pool.query(query, ['cancelled', parsedId]); // Use parsed integer

        res.status(200).json({ message: 'Delivery cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling delivery:', error);
        res.status(500).json({ error: 'Failed to cancel delivery' });
    }
};

module.exports = {
    upload,
    estimatePrice,
    cancelDelivery,
};