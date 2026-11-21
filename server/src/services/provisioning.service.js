const orderModel = require('../models/order.model');
const userModel = require('../models/user.model');
const serverPackageModel = require('../models/serverPackage.model');
const panelConnectionModel = require('../models/panelConnection.model');
const panelResourceModel = require('../models/panelResource.model');
const panelServerModel = require('../models/panelServer.model');
const provisioningModel = require('../models/provisioning.model');
const auditLogModel = require('../models/auditLog.model');
const providerAssignmentService = require('./providerAssignment.service');
const serverPackageService = require('./serverPackage.service');
const { providerManager } = require('../providers/providerManager');
const { decryptSecret } = require('../utils/crypto');
const {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} = require('../utils/errors');

const ELIGIBLE_ORDER_STATUSES = new Set(['completed', 'paid', 'accepted']);

/**
 * Validate that an order exists, is owned by the requester (or admin),
 * is paid/accepted, and has an immutable provider assignment snapshot.
 * @param {Object} actorUser
 * @param {string} orderId
 * @returns {Promise<Object>}
 */
async function validateOrderForProvisioning(actorUser, orderId) {
  const order = await orderModel.findById(orderId);
  if (!order) {
    throw new NotFoundError('Order not found', {}, 'ORDER_NOT_FOUND');
  }

  if (actorUser.role !== 'admin' && order.user_id !== actorUser.id) {
    throw new ForbiddenError('You do not have access to this order');
  }

  if (!ELIGIBLE_ORDER_STATUSES.has(order.status)) {
    throw new BadRequestError(
      `Order is not eligible for provisioning (status: ${order.status})`,
      { status: order.status },
      'ORDER_NOT_ELIGIBLE'
    );
  }

  if (!order.package_id) {
    throw new BadRequestError(
      'Order does not have an associated server package',
      {},
      'MISSING_ORDER_PACKAGE'
    );
  }

  if (!order.provider_assignment_snapshot || !order.provider_assignment_snapshot.provider_key) {
    throw new BadRequestError(
      'Order is missing an immutable provider assignment snapshot',
      {},
      'MISSING_ASSIGNMENT_SNAPSHOT'
    );
  }

  return order;
}

/**
 * Provision an eligible customer order through its immutable assigned provider.
 * Uses PostgreSQL row-level locking and idempotency keys to prevent duplicate servers.
 *
 * @param {Object} actorUser
 * @param {string} orderId
 * @param {{ server_name?: string, password?: string, attemptCount?: number }} options
 * @param {Object} reqMeta
 * @returns {Promise<Object>}
 */
async function provisionOrder(actorUser, orderId, options = {}, reqMeta = {}) {
  const order = await validateOrderForProvisioning(actorUser, orderId);
  const snapshot = order.provider_assignment_snapshot;
  const providerKey = snapshot.provider_key;
  const connectionId = snapshot.connection_id || null;

  // Enforce one server association per order
  const existingServer = await panelServerModel.findByOrderId(order.id);
  if (existingServer) {
    const existingLog = await provisioningModel.findLatestByOrderId(order.id);
    return {
      idempotent_replay: true,
      provisioning: existingLog,
      server: existingServer,
    };
  }

  // Validate provider & connection availability without automatic fallback
  const { provider } = await providerAssignmentService.assertProviderAvailable(
    providerKey,
    connectionId
  );

  const pkg = await serverPackageModel.findById(order.package_id);
  if (!pkg) {
    throw new NotFoundError('Associated server package no longer exists', {}, 'PACKAGE_NOT_FOUND');
  }

  if (providerKey === 'pterodactyl') {
    const availability = await serverPackageService.checkPackageAvailability({
      ...pkg,
      provider_key: providerKey,
      connection_id: connectionId,
      nest_id: snapshot.pterodactyl_resources?.nest_id,
      egg_id: snapshot.pterodactyl_resources?.egg_id,
      location_id: snapshot.pterodactyl_resources?.location_id,
      node_id: snapshot.pterodactyl_resources?.node_id,
      allocation_id: snapshot.pterodactyl_resources?.allocation_id,
    });
    if (!availability.available) {
      throw new AppError(
        availability.reasons[0] || 'Pterodactyl package resources are unavailable',
        400,
        'RESOURCE_CONFIGURATION_STALE',
        { availability }
      );
    }
  }

  const orderOwner = await userModel.findById(order.user_id);
  if (!orderOwner) {
    throw new NotFoundError('Order owner account not found', {}, 'USER_NOT_FOUND');
  }

  const attemptCount = options.attemptCount || 1;
  const idempotencyKey = `order:${order.id}:attempt:${attemptCount}`;
  const serverName =
    options.server_name ||
    `${snapshot.package_name || 'server'}-${order.id.slice(0, 8)}`;

  const { created, log } = await provisioningModel.acquireProvisioningLock({
    orderId: order.id,
    userId: order.user_id,
    providerKey,
    connectionId,
    idempotencyKey,
    requestMetadata: {
      server_name: serverName,
      package_id: order.package_id,
    },
    attemptCount,
  });

  if (!created) {
    if (log.status === 'successful') {
      const server = await panelServerModel.findByOrderId(order.id);
      return {
        idempotent_replay: true,
        provisioning: log,
        server,
      };
    }
    if (log.status === 'uncertain') {
      throw new ConflictError(
        'Provisioning for this order has an uncertain outcome and must be reconciled by an administrator before retrying',
        { provisioning_id: log.id, status: log.status },
        'PROVISIONING_UNCERTAIN'
      );
    }
    throw new ConflictError(
      `Provisioning is already ${log.status} for this order`,
      { provisioning_id: log.id, status: log.status },
      'PROVISIONING_IN_PROGRESS'
    );
  }

  let externalResult = null;

  try {
    if (providerKey === 'pterodactyl') {
      const conn = await panelConnectionModel.findEncryptedById(connectionId);
      if (!conn) {
        throw new NotFoundError('Pterodactyl connection not found', {}, 'CONNECTION_NOT_FOUND');
      }
      const apiKey = decryptSecret(conn.api_key_encrypted);
      const discoveredResources = await panelResourceModel.findByConnectionId(connectionId);

      externalResult = await provider.provisionServer({
        panelUrl: conn.panel_url,
        apiKey,
        idempotencyKey,
        serverName,
        customer: orderOwner,
        snapshot,
        discoveredResources,
      });
    } else if (providerKey === 'bwm-xmd') {
      const planId = snapshot.bwm_plan_id;
      if (!planId) {
        throw new BadRequestError(
          'BWM XMD package is missing bwm_plan_id',
          {},
          'MISSING_BWM_PLAN'
        );
      }
      if (!options.password) {
        throw new BadRequestError(
          'password is required for BWM XMD panel provisioning',
          {},
          'PASSWORD_REQUIRED'
        );
      }
      const bwmRes = await provider.provisionServer({
        username: orderOwner.username,
        password: options.password,
        plan: planId,
      });
      const srv = bwmRes?.server && typeof bwmRes.server === 'object' ? bwmRes.server : bwmRes;
      externalResult = {
        external_server_id: String(srv?.id ?? srv?.panel_id ?? srv?.server_id ?? order.id),
        panel_url: srv?.panel_url ?? srv?.url ?? null,
        status: srv?.status || 'active',
        raw: bwmRes,
      };
    }
  } catch (err) {
    if (err.isUncertain) {
      await provisioningModel.markUncertain(log.id, {
        errorCode: err.code || 'UNCERTAIN_PROVISIONING',
        errorMessage: err.message,
        responseMetadata: err.details || {},
      });
      await auditLogModel.createAuditLog({
        userId: actorUser.id,
        action: 'SERVER_PROVISIONING_UNCERTAIN',
        resourceType: 'provisioning_log',
        resourceId: log.id,
        ipAddress: reqMeta.ip,
        userAgent: reqMeta.userAgent,
        status: 'uncertain',
        details: { order_id: order.id, provider_key: providerKey, code: err.code },
      });
    } else {
      await provisioningModel.markFailed(log.id, {
        errorCode: err.code || 'PROVISIONING_FAILED',
        errorMessage: err.message,
        responseMetadata: err.details || {},
      });
      await auditLogModel.createAuditLog({
        userId: actorUser.id,
        action: 'SERVER_PROVISIONING_FAILED',
        resourceType: 'provisioning_log',
        resourceId: log.id,
        ipAddress: reqMeta.ip,
        userAgent: reqMeta.userAgent,
        status: 'failed',
        details: { order_id: order.id, provider_key: providerKey, code: err.code },
      });
    }
    throw err;
  }

  // Persist server association; if DB persistence fails after external creation, mark UNCERTAIN
  let savedServer;
  try {
    savedServer = await panelServerModel.createPanelServer({
      userId: order.user_id,
      orderId: order.id,
      packageId: order.package_id,
      providerKey,
      connectionId,
      bwmPanelId: providerKey === 'bwm-xmd' ? externalResult.external_server_id : null,
      externalServerId: externalResult.external_server_id,
      planId: snapshot.bwm_plan_id || pkg.id,
      planName: snapshot.package_name,
      serverName,
      panelUrl: externalResult.panel_url || null,
      username: orderOwner.username,
      status: externalResult.status || 'active',
      providerMetadata: externalResult,
    });
  } catch (dbErr) {
    await provisioningModel.markUncertain(log.id, {
      externalServerId: externalResult.external_server_id,
      errorCode: 'DB_PERSISTENCE_FAILED',
      errorMessage: 'External server was created but local persistence failed; reconcile required',
      responseMetadata: { external_server_id: externalResult.external_server_id },
    });
    throw new AppError(
      'Server was created on provider but local record persistence failed; reconciliation required',
      500,
      'DB_PERSISTENCE_FAILED',
      { provisioning_id: log.id }
    );
  }

  const completedLog = await provisioningModel.markSuccessful(log.id, {
    serverId: savedServer.id,
    externalServerId: externalResult.external_server_id,
    responseMetadata: externalResult,
  });

  await auditLogModel.createAuditLog({
    userId: actorUser.id,
    action: 'SERVER_PROVISIONED',
    resourceType: 'panel_server',
    resourceId: savedServer.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    status: 'success',
    details: {
      order_id: order.id,
      provider_key: providerKey,
      external_server_id: externalResult.external_server_id,
    },
  });

  return {
    idempotent_replay: false,
    provisioning: completedLog,
    server: savedServer,
  };
}

/**
 * Retrieve provisioning status for an owned order.
 * @param {Object} actorUser
 * @param {string} orderId
 * @returns {Promise<Object>}
 */
async function getOrderProvisioningStatus(actorUser, orderId) {
  const order = await orderModel.findById(orderId);
  if (!order) {
    throw new NotFoundError('Order not found', {}, 'ORDER_NOT_FOUND');
  }
  if (actorUser.role !== 'admin' && order.user_id !== actorUser.id) {
    throw new ForbiddenError('You do not have access to this order');
  }

  const log = await provisioningModel.findLatestByOrderId(orderId);
  const server = await panelServerModel.findByOrderId(orderId);

  return {
    order_id: order.id,
    provisioning: log,
    server,
  };
}

/**
 * Admin: List provisioning logs.
 */
async function listProvisioningAdmin(query) {
  return provisioningModel.findAll({
    status: query.status || null,
    limit: Math.min(Number(query.limit) || 100, 200),
    offset: Math.max(Number(query.offset) || 0, 0),
  });
}

/**
 * Admin: Retrieve a single provisioning log.
 */
async function getProvisioningAdmin(id) {
  const log = await provisioningModel.findById(id);
  if (!log) {
    throw new NotFoundError('Provisioning log not found', {}, 'PROVISIONING_NOT_FOUND');
  }
  return log;
}

/**
 * Admin: Reconcile an uncertain provisioning operation by querying the provider safely.
 * For Pterodactyl, checks `external_id` (`idempotency_key`) via Application API.
 * Never blindly creates a second server.
 *
 * @param {Object} adminUser
 * @param {string} logId
 * @param {Object} reqMeta
 * @returns {Promise<Object>}
 */
async function reconcileProvisioning(adminUser, logId, reqMeta = {}) {
  const log = await provisioningModel.findById(logId);
  if (!log) {
    throw new NotFoundError('Provisioning log not found', {}, 'PROVISIONING_NOT_FOUND');
  }

  if (log.status === 'successful') {
    const server = await panelServerModel.findByOrderId(log.order_id);
    return { outcome: 'already_successful', provisioning: log, server };
  }

  if (log.provider_key === 'pterodactyl') {
    const conn = await panelConnectionModel.findEncryptedById(log.connection_id);
    if (!conn) {
      throw new NotFoundError('Original Pterodactyl connection not found', {}, 'CONNECTION_NOT_FOUND');
    }
    const apiKey = decryptSecret(conn.api_key_encrypted);
    const pteroProvider = providerManager.getProvider('pterodactyl');

    const remoteServer = await pteroProvider.findServerByExternalId({
      panelUrl: conn.panel_url,
      apiKey,
      externalId: log.idempotency_key,
    });

    if (remoteServer) {
      const order = await orderModel.findById(log.order_id);
      const orderOwner = await userModel.findById(log.user_id);
      const snapshot = order?.provider_assignment_snapshot || {};

      let server = await panelServerModel.findByOrderId(log.order_id);
      if (!server) {
        server = await panelServerModel.createPanelServer({
          userId: log.user_id,
          orderId: log.order_id,
          packageId: order?.package_id || null,
          providerKey: 'pterodactyl',
          connectionId: log.connection_id,
          externalServerId: String(remoteServer.id),
          planId: order?.package_id || 'pterodactyl',
          planName: snapshot.package_name || null,
          serverName: remoteServer.name || log.request_metadata?.server_name || 'server',
          panelUrl: conn.panel_url,
          username: orderOwner?.username || 'customer',
          status: remoteServer.status || 'active',
          providerMetadata: { identifier: remoteServer.identifier, uuid: remoteServer.uuid },
        });
      }

      const updatedLog = await provisioningModel.markSuccessful(log.id, {
        serverId: server.id,
        externalServerId: String(remoteServer.id),
        responseMetadata: { reconciled: true, identifier: remoteServer.identifier },
      });

      await auditLogModel.createAuditLog({
        userId: adminUser.id,
        action: 'PROVISIONING_RECONCILED_SUCCESS',
        resourceType: 'provisioning_log',
        resourceId: log.id,
        ipAddress: reqMeta.ip,
        userAgent: reqMeta.userAgent,
        status: 'success',
        details: { external_server_id: String(remoteServer.id) },
      });

      return { outcome: 'confirmed_created', provisioning: updatedLog, server };
    }

    // Confirmed 404 on Pterodactyl -> safe to mark failed so an admin can authorize a retry
    const failedLog = await provisioningModel.markFailed(log.id, {
      errorCode: 'CONFIRMED_NOT_CREATED',
      errorMessage: 'Server was not found on Pterodactyl panel during reconciliation',
    });

    await auditLogModel.createAuditLog({
      userId: adminUser.id,
      action: 'PROVISIONING_RECONCILED_NOT_CREATED',
      resourceType: 'provisioning_log',
      resourceId: log.id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      status: 'success',
    });

    return { outcome: 'confirmed_not_created', provisioning: failedLog, server: null };
  }

  // BWM XMD does not support deterministic external_id server lookup; keep uncertain for manual review
  await auditLogModel.createAuditLog({
    userId: adminUser.id,
    action: 'PROVISIONING_RECONCILIATION_MANUAL_REQUIRED',
    resourceType: 'provisioning_log',
    resourceId: log.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    status: 'uncertain',
  });

  return {
    outcome: 'manual_review_required',
    provisioning: log,
    server: null,
  };
}

/**
 * Admin: Authorize a new provisioning attempt ONLY when the previous attempt is definitively `failed`.
 * Never permits retrying an `uncertain`, `successful`, or `processing` operation.
 */
async function retryProvisioningAdmin(adminUser, logId, options = {}, reqMeta = {}) {
  const log = await provisioningModel.findById(logId);
  if (!log) {
    throw new NotFoundError('Provisioning log not found', {}, 'PROVISIONING_NOT_FOUND');
  }

  if (log.status !== 'failed') {
    throw new ConflictError(
      `Cannot retry provisioning while status is "${log.status}". Reconcile uncertain operations first.`,
      { status: log.status },
      'RETRY_NOT_ALLOWED'
    );
  }

  await auditLogModel.createAuditLog({
    userId: adminUser.id,
    action: 'PROVISIONING_RETRY_AUTHORIZED',
    resourceType: 'provisioning_log',
    resourceId: log.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    status: 'success',
    details: { order_id: log.order_id, next_attempt: log.attempt_count + 1 },
  });

  return provisionOrder(
    adminUser,
    log.order_id,
    { ...options, attemptCount: log.attempt_count + 1 },
    reqMeta
  );
}

module.exports = {
  provisionOrder,
  getOrderProvisioningStatus,
  listProvisioningAdmin,
  getProvisioningAdmin,
  reconcileProvisioning,
  retryProvisioningAdmin,
};

