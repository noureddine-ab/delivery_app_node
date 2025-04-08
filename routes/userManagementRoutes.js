const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Search users
router.get('/search', userController.searchUsers);

// Assign role to user
router.post('/assign-role', userController.assignRole);

// Delete User
router.delete('/:userId', userController.deleteUser);

module.exports = router;