const panelManagementService = require('../services/panelManagement.service');
const { sendSuccess } = require('../utils/apiResponse');

function getReqMeta(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  };
}

async function getPlans(req, res, next) {
  try {
    const data = await panelManagementService.getPlans();
    return sendSuccess(res, { message: 'Panel plans retrieved successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function listMyPanels(req, res, next) {
  try {
    const servers = await panelManagementService.listMyPanels(req.user);
    return sendSuccess(res, {
      message: 'Panel server records retrieved successfully',
      data: { servers },
    });
  } catch (err) {
    return next(err);
  }
}

async function provisionPanel(req, res, next) {
  try {
    const data = await panelManagementService.provisionPanel(
      req.user,
      req.validatedBody,
      getReqMeta(req)
    );
    return sendSuccess(res, {
      statusCode: 201,
      message: 'Panel server provisioned successfully',
      data,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getPlans,
  listMyPanels,
  provisionPanel,
};

