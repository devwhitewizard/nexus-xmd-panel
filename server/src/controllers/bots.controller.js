const bwmBotsService = require('../services/bwm/bots.service');
const botManagementService = require('../services/botManagement.service');
const { sendSuccess } = require('../utils/apiResponse');

function getReqMeta(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  };
}

async function getPricing(req, res, next) {
  try {
    const data = await bwmBotsService.getPricing();
    return sendSuccess(res, { message: 'Bot pricing retrieved successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getTemplates(req, res, next) {
  try {
    const data = await bwmBotsService.getTemplates();
    return sendSuccess(res, { message: 'Bot templates retrieved successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function deployBot(req, res, next) {
  try {
    const data = await botManagementService.deployBot(req.user, req.validatedBody, getReqMeta(req));
    return sendSuccess(res, {
      statusCode: 201,
      message: 'Bot deployed successfully',
      data,
    });
  } catch (err) {
    return next(err);
  }
}

async function recoverBot(req, res, next) {
  try {
    const data = await botManagementService.recoverBot(req.user, req.validatedBody, getReqMeta(req));
    return sendSuccess(res, { message: 'Bot recovered successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function listBots(req, res, next) {
  try {
    const bots = await botManagementService.listBots(req.user);
    return sendSuccess(res, { message: 'Bots retrieved successfully', data: { bots } });
  } catch (err) {
    return next(err);
  }
}

async function getBot(req, res, next) {
  try {
    const bot = await botManagementService.getBot(req.bot);
    return sendSuccess(res, { message: 'Bot retrieved successfully', data: { bot } });
  } catch (err) {
    return next(err);
  }
}

async function startBot(req, res, next) {
  try {
    const data = await botManagementService.startBot(req.user, req.bot, getReqMeta(req));
    return sendSuccess(res, { message: 'Bot started successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function stopBot(req, res, next) {
  try {
    const data = await botManagementService.stopBot(req.user, req.bot, getReqMeta(req));
    return sendSuccess(res, { message: 'Bot stopped successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function restartBot(req, res, next) {
  try {
    const data = await botManagementService.restartBot(req.user, req.bot, getReqMeta(req));
    return sendSuccess(res, { message: 'Bot restarted successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function extendBot(req, res, next) {
  try {
    const data = await botManagementService.extendBot(req.user, req.bot, req.validatedBody, getReqMeta(req));
    return sendSuccess(res, { message: 'Bot extended successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getBotLogs(req, res, next) {
  try {
    const data = await botManagementService.getBotLogs(req.bot, req.query);
    return sendSuccess(res, { message: 'Bot logs retrieved successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function getBotVars(req, res, next) {
  try {
    const data = await botManagementService.getBotVars(req.bot);
    return sendSuccess(res, { message: 'Bot environment variables retrieved successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function updateBotVars(req, res, next) {
  try {
    const data = await botManagementService.updateBotVars(
      req.user,
      req.bot,
      req.validatedBody.env_vars,
      getReqMeta(req)
    );
    return sendSuccess(res, { message: 'Bot environment variables updated successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function deleteBot(req, res, next) {
  try {
    const recoveryAuthorized =
      req.body?.recovery_authorized === true || req.query?.recovery_authorized === 'true';
    const reason = req.body?.reason || '';
    const data = await botManagementService.deleteBot(
      req.user,
      req.bot,
      { recoveryAuthorized, reason },
      getReqMeta(req)
    );
    return sendSuccess(res, { message: 'Bot deleted via recovery workflow', data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getPricing,
  getTemplates,
  deployBot,
  recoverBot,
  listBots,
  getBot,
  startBot,
  stopBot,
  restartBot,
  extendBot,
  getBotLogs,
  getBotVars,
  updateBotVars,
  deleteBot,
};

