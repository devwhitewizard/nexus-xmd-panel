const express = require('express');
const adminController = require('../controllers/admin.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/orders', adminController.listOrders);
router.get('/users', adminController.listUsers);
router.get('/audit-logs', adminController.listAuditLogs);
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.upsertSetting);

module.exports = router;

