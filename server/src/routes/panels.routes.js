const express = require('express');
const panelsController = require('../controllers/panels.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateProvisionPanel } = require('../validators/panels.validator');

const router = express.Router();

router.use(authenticate);

router.get('/plans', panelsController.getPlans);
router.get('/', panelsController.listMyPanels);
router.post('/provision', validateProvisionPanel, panelsController.provisionPanel);

module.exports = router;

