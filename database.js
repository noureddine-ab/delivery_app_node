const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
});

// Test connection
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log('Connected to MySQL database:', process.env.DB_NAME);
        connection.release();
    } catch (error) {
        console.error('Database connection failed:', error);
    }
})();

module.exports = pool;