const db = require('../database');

exports.searchUsers = async (req, res) => {
    try {
        const { query } = req.query;
        const [users] = await db.query(`
            SELECT u.id, u.name, u.email, u.phone, 
                   d.user_id AS driver_id, a.user_id AS admin_id
            FROM users u
            LEFT JOIN drivers d ON u.id = d.user_id
            LEFT JOIN admins a ON u.id = a.user_id
            WHERE u.name LIKE ? OR u.email LIKE ?
        `, [`%${query}%`, `%${query}%`]);

        res.json(users.map(user => ({
            ...user,
            isDriver: !!user.driver_id,
            isAdmin: !!user.admin_id
        })));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.assignRole = async (req, res) => {
    try {
        const { userId, role } = req.body;

        // Validate role
        if (!['driver', 'admin'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role' });
        }

        // Check existing roles
        const [existing] = await db.query(
            `SELECT * FROM ${role === 'driver' ? 'drivers' : 'admins'} WHERE user_id = ?`,
            [userId]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: `User is already a ${role}` });
        }

        // Assign role
        await db.query(
            `INSERT INTO ${role === 'driver' ? 'drivers' : 'admins'} (user_id) VALUES (?)`,
            [userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};