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
        const imagePath = req.file ? path.join('uploads', req.file.filename) : null; // Fix path

        // Your price calculation logic here
        const estimatedPrice = 50;

        // Save to MySQL
        const query = `
      INSERT INTO deliveries (object_type, source, destination, shipping_date, image_path, estimated_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
        await pool.query(query, [
            objectType,
            source,
            destination,
            shippingDate,
            imagePath,
            estimatedPrice,
        ]);

        res.status(200).json({ price: estimatedPrice });
    } catch (error) {
        console.error('Error estimating price:', error);
        res.status(500).json({ error: 'Failed to estimate price' });
    }
};

module.exports = {
    upload,
    estimatePrice,
};