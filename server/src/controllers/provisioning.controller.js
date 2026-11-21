const provisioningService = require('../services/provisioning.service');
const { sendSuccess } = require('../utils/apiResponse');

function getReqMeta(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  };
}

/**
 * Customer/Admin: Request provisioning for an eligible owned order.
 */
async function provisionOrder(req, res, next) {
  try {
    const result = await provisioningService.provisionOrder(
      req.user,
      req.params.orderId,
      req.validatedBody,
      getReqMeta(req)
    );
    return sendSuccess(res, {
      statusCode: result.idempotent_replay ? 200 : 201,
      message: result.idempotent_replay
        ? 'Order already provisioned (idempotent replay)'
        : 'Server provisioned successfully',
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Customer/Admin: Retrieve provisioning status for an owned order.
 */
async function getOrderProvisioningStatus(req, res, next) {
  try {
    const data = await provisioningService.getOrderProvisioningStatus(
      req.user,
      req.params.orderId
    );
    return sendSuccess(res, {
      message: 'Provisioning status retrieved successfully',
      data,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Admin: List all provisioning operations.
 */
async function listProvisioningAdmin(req, res, next) {
  try {
    const logs = await provisioningService.listProvisioningAdmin(req.query);
    return sendSuccess(res, {
      message: 'Provisioning logs retrieved successfully',
      data: { provisioning_logs: logs },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Admin: View a single provisioning operation.
 */
async function getProvisioningAdmin(req, res, next) {
  try {
    const log = await provisioningService.getProvisioningAdmin(req.params.id);
    return sendSuccess(res, {
      message: 'Provisioning log retrieved successfully',
      data: { provisioning: log },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Admin: Reconcile an uncertain provisioning operation.
 */
async function reconcileProvisioning(req, res, next) {
  try {
    const data = await provisioningService.reconcileProvisioning(
      req.user,
      req.params.id,
      getReqMeta(req)
    );
    return sendSuccess(res, {
      message: 'Provisioning reconciliation completed',
      data,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Admin: Authorize a retry after a confirmed failed provisioning attempt.
 */
async function retryProvisioning(req, res, next) {
  try {
    const data = await provisioningService.retryProvisioningAdmin(
      req.user,
      req.params.id,
      req.validatedBody,
      getReqMeta(req)
    );
    return sendSuccess(res, {
      statusCode: 201,
      message: 'Provisioning retry completed successfully',
      data,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  provisionOrder,
  getOrderProvisioningStatus,
  listProvisioningAdmin,
  getProvisioningAdmin,
  reconcileProvisioning,
  retryProvisioning,
};

