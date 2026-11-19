const express = require('express');
const accountController = require('../controllers/account.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/balance', accountController.getBalance);
router.get('/orders', accountController.getOrders);

module.exports = router;

