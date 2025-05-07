const pool = require('../database');

exports.getDashboardData = async (req, res) => {
    try {
        // Parallel queries for better performance
        const [
            driversCount,
            customersCount,
            usersCount,
            deliveryStats,
            recentDeliveries,
            topDrivers
        ] = await Promise.all([
            pool.query("SELECT COUNT(*) AS count FROM drivers"),
            pool.query("SELECT COUNT(DISTINCT customer_id) AS count FROM customerorder"),
            pool.query("SELECT COUNT(*) AS count FROM users"),
            pool.query(`SELECT 
                CAST(COALESCE(SUM(status = 'pending'), 0) AS UNSIGNED) AS pending,
                CAST(COALESCE(SUM(status = 'in_transit'), 0) AS UNSIGNED) AS in_transit,
                CAST(COALESCE(SUM(status = 'delivered'), 0) AS UNSIGNED) AS delivered,
                CAST(COALESCE(SUM(status = 'failed'), 0) AS UNSIGNED) AS canceled
                FROM delivery`),
            pool.query(`SELECT d.order_id, d.status, d.created_at, u.name AS customer_name 
                FROM delivery d
                JOIN customerorder co ON d.order_id = co.id
                JOIN users u ON co.customer_id = u.id
                ORDER BY d.created_at DESC LIMIT 5`),
            pool.query(`SELECT u.name, d.vehicle_type, d.rating 
                FROM drivers d
                JOIN users u ON d.user_id = u.id
                ORDER BY d.rating DESC LIMIT 5`)
        ]);

        // Convert all counts to numbers
        const stats = {
            drivers: parseInt(driversCount[0][0].count, 10),
            customers: parseInt(customersCount[0][0].count, 10),
            users: parseInt(usersCount[0][0].count, 10),
            deliveries: {
                pending: parseInt(deliveryStats[0][0].pending, 10),
                in_transit: parseInt(deliveryStats[0][0].in_transit, 10),
                delivered: parseInt(deliveryStats[0][0].delivered, 10),
                canceled: parseInt(deliveryStats[0][0].canceled, 10),
            }
        };

        res.json({
            success: true,
            stats,
            recentDeliveries: recentDeliveries[0],
            topDrivers: topDrivers[0]
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load dashboard data'
        });
    }
};