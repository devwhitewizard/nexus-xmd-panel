const express = require('express');
const ordersController = require('../controllers/orders.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);
router.get('/', ordersController.getMyOrders);

module.exports = router;

