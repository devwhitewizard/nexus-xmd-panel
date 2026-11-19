const express = require('express');
const botsController = require('../controllers/bots.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireBotOwnership } = require('../middleware/ownership.middleware');
const {
  validateDeployBot,
  validateExtendBot,
  validateRecoverBot,
  validateUpdateVars,
} = require('../validators/bots.validator');

const router = express.Router();

router.use(authenticate);

// Public-to-authenticated-customers catalogue & deployment routes
router.get('/pricing', botsController.getPricing);
router.get('/templates', botsController.getTemplates);
router.post('/deploy', validateDeployBot, botsController.deployBot);
router.post('/recover', validateRecoverBot, botsController.recoverBot);
router.get('/', botsController.listBots);

// Ownership-enforced bot instance routes
router.get('/:id', requireBotOwnership, botsController.getBot);
router.post('/:id/start', requireBotOwnership, botsController.startBot);
router.post('/:id/stop', requireBotOwnership, botsController.stopBot);
router.post('/:id/restart', requireBotOwnership, botsController.restartBot);
router.post('/:id/extend', requireBotOwnership, validateExtendBot, botsController.extendBot);
router.get('/:id/logs', requireBotOwnership, botsController.getBotLogs);
router.get('/:id/vars', requireBotOwnership, botsController.getBotVars);
router.put('/:id/vars', requireBotOwnership, validateUpdateVars, botsController.updateBotVars);
router.delete('/:id', requireBotOwnership, botsController.deleteBot);

module.exports = router;

