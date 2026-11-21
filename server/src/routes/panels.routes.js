const express = require('express');
const panelsController = require('../controllers/panels.controller');
const panelConnectionsController = require('../controllers/panelConnections.controller');
const serverPackagesController = require('../controllers/serverPackages.controller');
const providerAssignmentController = require('../controllers/providerAssignment.controller');
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
const {
  validatePackageIdParam,
  validateCreatePackage,
  validateUpdatePackage,
  validatePackageStatus,
} = require('../validators/serverPackages.validator');
const {
  validatePackageIdRouteParam,
  validateAssignProvider,
} = require('../validators/providerAssignment.validator');

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

// Customer read-only server packages
router.get('/packages', serverPackagesController.listPackagesCustomer);
router.get(
  '/packages/:id',
  validatePackageIdParam,
  serverPackagesController.getPackageCustomer
);

// Admin-only server package management
router.get('/admin/packages', requireRole('admin'), serverPackagesController.listPackagesAdmin);
router.post(
  '/admin/packages',
  requireRole('admin'),
  validateCreatePackage,
  serverPackagesController.createPackage
);
router.get(
  '/admin/packages/:id',
  requireRole('admin'),
  validatePackageIdParam,
  serverPackagesController.getPackageAdmin
);
router.put(
  '/admin/packages/:id',
  requireRole('admin'),
  validatePackageIdParam,
  validateUpdatePackage,
  serverPackagesController.updatePackage
);
router.patch(
  '/admin/packages/:id/status',
  requireRole('admin'),
  validatePackageIdParam,
  validatePackageStatus,
  serverPackagesController.setPackageStatus
);
router.delete(
  '/admin/packages/:id',
  requireRole('admin'),
  validatePackageIdParam,
  serverPackagesController.deletePackage
);

// Admin-only provider assignment & resolution endpoints
router.get('/admin/providers', requireRole('admin'), providerAssignmentController.listProviders);
router.get(
  '/admin/provider-assignments',
  requireRole('admin'),
  providerAssignmentController.listAssignments
);
router.get(
  '/admin/provider-assignments/:packageId',
  requireRole('admin'),
  validatePackageIdRouteParam,
  providerAssignmentController.getAssignment
);
router.put(
  '/admin/provider-assignments/:packageId',
  requireRole('admin'),
  validatePackageIdRouteParam,
  validateAssignProvider,
  providerAssignmentController.assignProvider
);
router.post(
  '/admin/provider-assignments/:packageId/validate',
  requireRole('admin'),
  validatePackageIdRouteParam,
  providerAssignmentController.validateAssignment
);

module.exports = router;
