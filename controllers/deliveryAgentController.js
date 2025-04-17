const pool = require('../database');

const getPendingOrders = async (req, res) => {
    try {
        const { source } = req.query;

        const query = `
            SELECT 
                co.id AS order_id,
                p.object_type,
                p.image_path,
                co.source,
                co.destination,
                co.date
            FROM customerorder co
            JOIN product p ON co.id = p.customer_order_id
            JOIN delivery d ON co.id = d.order_id
            WHERE d.status = 'pending'
            ${source ? `AND co.source LIKE ?` : ''}
            ORDER BY co.date DESC
        `;

        const params = source ? [`%${source}%`] : [];

        const [orders] = await pool.query(query, params);

        const formattedOrders = orders.map(order => ({
            id: order.order_id,
            objectType: order.object_type,
            imageUrl: order.image_path ? `/uploads/${order.image_path}` : null,
            source: order.source,
            destination: order.destination,
            date: order.date
        }));

        res.status(200).json(formattedOrders);
    } catch (error) {
        console.error('Error fetching pending orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
};

module.exports = {
    getPendingOrders
};