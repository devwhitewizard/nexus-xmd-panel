const express = require('express');
const panelsController = require('../controllers/panels.controller');
const panelConnectionsController = require('../controllers/panelConnections.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { validateProvisionPanel } = require('../validators/panels.validator');
const {
  validateConnectionIdParam,
  validateCreateConnection,
  validateUpdateConnection,
  validateConnectionStatus,
  validateResourceConfiguration,
} = require('../validators/panelConnections.validator');

const router = express.Router();

router.use(authenticate);

// Existing BWM XMD Panels routes (preserved unchanged)
router.get('/plans', panelsController.getPlans);
router.get('/', panelsController.listMyPanels);
router.post('/provision', validateProvisionPanel, panelsController.provisionPanel);

// Admin-only multi-provider & dynamic Pterodactyl connection routes
router.get('/providers', requireRole('admin'), panelConnectionsController.listProviders);

router.get('/connections', requireRole('admin'), panelConnectionsController.listConnections);
router.post(
  '/connections',
  requireRole('admin'),
  validateCreateConnection,
  panelConnectionsController.createConnection
);
router.get(
  '/connections/:id',
  requireRole('admin'),
  validateConnectionIdParam,
  panelConnectionsController.getConnection
);
router.put(
  '/connections/:id',
  requireRole('admin'),
  validateConnectionIdParam,
  validateUpdateConnection,
  panelConnectionsController.updateConnection
);
router.patch(
  '/connections/:id/status',
  requireRole('admin'),
  validateConnectionIdParam,
  validateConnectionStatus,
  panelConnectionsController.setConnectionStatus
);
router.delete(
  '/connections/:id',
  requireRole('admin'),
  validateConnectionIdParam,
  panelConnectionsController.deleteConnection
);
router.post(
  '/connections/:id/test',
  requireRole('admin'),
  validateConnectionIdParam,
  panelConnectionsController.testConnection
);

router.get(
  '/connections/:id/resources',
  requireRole('admin'),
  validateConnectionIdParam,
  panelConnectionsController.getResources
);
router.post(
  '/connections/:id/resources/refresh',
  requireRole('admin'),
  validateConnectionIdParam,
  panelConnectionsController.refreshResources
);
router.put(
  '/connections/:id/resources/configuration',
  requireRole('admin'),
  validateConnectionIdParam,
  validateResourceConfiguration,
  panelConnectionsController.updateResourceConfiguration
);

module.exports = router;
