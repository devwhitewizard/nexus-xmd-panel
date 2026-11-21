const panelConnectionService = require('../services/panelConnection.service');
const panelResourceService = require('../services/panelResource.service');
const { sendSuccess } = require('../utils/apiResponse');

function getReqMeta(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  };
}

async function listProviders(req, res, next) {
  try {
    const providers = panelConnectionService.listProviders();
    return sendSuccess(res, {
      message: 'Infrastructure providers retrieved successfully',
      data: { providers },
    });
  } catch (err) {
    return next(err);
  }
}

async function createConnection(req, res, next) {
  try {
    const connection = await panelConnectionService.createConnection(
      req.user,
      req.validatedBody,
      getReqMeta(req)
    );
    return sendSuccess(res, {
      statusCode: 201,
      message: 'Pterodactyl panel connection registered successfully',
      data: { connection },
    });
  } catch (err) {
    return next(err);
  }
}

async function listConnections(req, res, next) {
  try {
    const connections = await panelConnectionService.listConnections();
    return sendSuccess(res, {
      message: 'Panel connections retrieved successfully',
      data: { connections },
    });
  } catch (err) {
    return next(err);
  }
}

async function getConnection(req, res, next) {
  try {
    const connection = await panelConnectionService.getConnection(req.params.id);
    return sendSuccess(res, {
      message: 'Panel connection retrieved successfully',
      data: { connection },
    });
  } catch (err) {
    return next(err);
  }
}

async function updateConnection(req, res, next) {
  try {
    const connection = await panelConnectionService.updateConnection(
      req.user,
      req.params.id,
      req.validatedBody,
      getReqMeta(req)
    );
    return sendSuccess(res, {
      message: 'Panel connection updated successfully',
      data: { connection },
    });
  } catch (err) {
    return next(err);
  }
}

async function setConnectionStatus(req, res, next) {
  try {
    const connection = await panelConnectionService.setConnectionStatus(
      req.user,
      req.params.id,
      req.validatedBody.is_enabled,
      getReqMeta(req)
    );
    return sendSuccess(res, {
      message: `Panel connection ${connection.is_enabled ? 'enabled' : 'disabled'} successfully`,
      data: { connection },
    });
  } catch (err) {
    return next(err);
  }
}

async function deleteConnection(req, res, next) {
  try {
    const result = await panelConnectionService.deleteConnection(
      req.user,
      req.params.id,
      getReqMeta(req)
    );
    return sendSuccess(res, {
      message: 'Panel connection deleted successfully',
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

async function testConnection(req, res, next) {
  try {
    const data = await panelConnectionService.testConnection(
      req.user,
      req.params.id,
      getReqMeta(req)
    );
    return sendSuccess(res, {
      message: 'Pterodactyl panel connection verified successfully',
      data,
    });
  } catch (err) {
    return next(err);
  }
}

async function getResources(req, res, next) {
  try {
    const resources = await panelResourceService.getResources(req.params.id);
    return sendSuccess(res, {
      message: 'Panel resources retrieved successfully',
      data: { resources },
    });
  } catch (err) {
    return next(err);
  }
}

async function refreshResources(req, res, next) {
  try {
    const resources = await panelResourceService.refreshResources(
      req.user,
      req.params.id,
      getReqMeta(req)
    );
    return sendSuccess(res, {
      message: 'Panel resources synchronized successfully',
      data: { resources },
    });
  } catch (err) {
    return next(err);
  }
}

async function updateResourceConfiguration(req, res, next) {
  try {
    const resources = await panelResourceService.updateManualConfiguration(
      req.user,
      req.params.id,
      req.validatedBody,
      getReqMeta(req)
    );
    return sendSuccess(res, {
      message: 'Panel resource configuration updated successfully',
      data: { resources },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listProviders,
  createConnection,
  listConnections,
  getConnection,
  updateConnection,
  setConnectionStatus,
  deleteConnection,
  testConnection,
  getResources,
  refreshResources,
  updateResourceConfiguration,
};

