const orderModel = require('../models/order.model');
const auditLogModel = require('../models/auditLog.model');
const platformSettingModel = require('../models/platformSetting.model');
const userModel = require('../models/user.model');
const { sendSuccess } = require('../utils/apiResponse');
const { BadRequestError } = require('../utils/errors');

async function listOrders(req, res, next) {
  try {
    const { status, limit = 100, offset = 0 } = req.query;
    const orders = await orderModel.findAll({
      status: status || null,
      limit: Math.min(Number(limit) || 100, 200),
      offset: Number(offset) || 0,
    });
    return sendSuccess(res, { message: 'Platform orders retrieved successfully', data: { orders } });
  } catch (err) {
    return next(err);
  }
}

async function listUsers(req, res, next) {
  try {
    const users = await userModel.listUsers({
      limit: Math.min(Number(req.query.limit) || 50, 200),
      offset: Number(req.query.offset) || 0,
    });
    return sendSuccess(res, { message: 'Users retrieved successfully', data: { users } });
  } catch (err) {
    return next(err);
  }
}

async function listAuditLogs(req, res, next) {
  try {
    const logs = await auditLogModel.listAuditLogs({
      limit: Math.min(Number(req.query.limit) || 100, 200),
      offset: Number(req.query.offset) || 0,
    });
    return sendSuccess(res, { message: 'Audit logs retrieved successfully', data: { logs } });
  } catch (err) {
    return next(err);
  }
}

async function getSettings(req, res, next) {
  try {
    const settings = await platformSettingModel.listSettings();
    return sendSuccess(res, { message: 'Platform settings retrieved successfully', data: { settings } });
  } catch (err) {
    return next(err);
  }
}

async function upsertSetting(req, res, next) {
  try {
    const { key, value, description } = req.body || {};
    if (typeof key !== 'string' || key.length === 0 || value === undefined) {
      return next(new BadRequestError('key and value are required'));
    }
    const setting = await platformSettingModel.setSetting(key, value, description || null, req.user.id);
    return sendSuccess(res, { message: 'Platform setting saved successfully', data: { setting } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listOrders,
  listUsers,
  listAuditLogs,
  getSettings,
  upsertSetting,
};

