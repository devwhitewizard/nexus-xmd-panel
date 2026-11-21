const serverManagementService = require('../services/serverManagement.service');
const { sendSuccess } = require('../utils/apiResponse');

function getReqMeta(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  };
}

async function listServers(req, res, next) {
  try {
    const data = await serverManagementService.listServers(req.user, req.validatedQuery);
    return sendSuccess(res, {
      message: 'Servers retrieved successfully',
      data,
    });
  } catch (err) {
    return next(err);
  }
}

async function getServerDetails(req, res, next) {
  try {
    const data = await serverManagementService.getServerDetails(req.user, req.params.id);
    return sendSuccess(res, {
      message: 'Server details retrieved successfully',
      data,
    });
  } catch (err) {
    return next(err);
  }
}

function makePowerHandler(signal) {
  return async (req, res, next) => {
    try {
      const data = await serverManagementService.sendPowerAction(
        req.user,
        req.params.id,
        signal,
        getReqMeta(req)
      );
      return sendSuccess(res, {
        message: `Server ${signal} command accepted`,
        data,
      });
    } catch (err) {
      return next(err);
    }
  };
}

async function getServerResources(req, res, next) {
  try {
    const data = await serverManagementService.getServerResources(req.user, req.params.id);
    return sendSuccess(res, {
      message: 'Server resources retrieved successfully',
      data,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listServers,
  getServerDetails,
  startServer: makePowerHandler('start'),
  stopServer: makePowerHandler('stop'),
  restartServer: makePowerHandler('restart'),
  getServerResources,
};

