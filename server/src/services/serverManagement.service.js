const panelServerModel = require('../models/panelServer.model');
const panelConnectionModel = require('../models/panelConnection.model');
const serverPackageModel = require('../models/serverPackage.model');
const auditLogModel = require('../models/auditLog.model');
const { providerManager } = require('../providers/providerManager');
const { decryptSecret } = require('../utils/crypto');
const {
  AppError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} = require('../utils/errors');

/**
 * Strip internal connection IDs and sensitive metadata before returning a server record to customers.
 * @param {Object} server
 * @returns {Object}
 */
function toSafeServerView(server) {
  return {
    id: server.id,
    order_id: server.order_id,
    package_id: server.package_id || null,
    provider_key: server.provider_key || 'bwm-xmd',
    server_name: server.server_name || server.plan_name || server.username,
    plan_id: server.plan_id,
    plan_name: server.plan_name,
    panel_url: server.panel_url,
    username: server.username,
    status: server.status,
    external_server_id: server.external_server_id || server.bwm_panel_id || null,
    created_at: server.created_at,
    updated_at: server.updated_at,
  };
}

/**
 * Verify server existence and customer ownership.
 * Always resolves the server's stored provider association (never customer-supplied).
 * @param {Object} actorUser
 * @param {string} serverId
 * @returns {Promise<{ server: Object, provider: Object }>}
 */
async function loadOwnedServerAndProvider(actorUser, serverId) {
  const server = await panelServerModel.findById(serverId);
  if (!server) {
    throw new NotFoundError('Server not found', {}, 'SERVER_NOT_FOUND');
  }

  if (actorUser.role !== 'admin' && server.user_id !== actorUser.id) {
    throw new ForbiddenError('You do not have access to this server');
  }

  const providerKey = server.provider_key || 'bwm-xmd';
  const provider = providerManager.getProvider(providerKey);
  return { server, provider };
}

/**
 * Resolve encrypted Pterodactyl connection credentials for an owned server.
 * @param {Object} server
 * @returns {Promise<{ panelUrl: string, apiKey: string, identifier: string }>}
 */
async function resolvePterodactylServerContext(server) {
  if (!server.connection_id) {
    throw new AppError(
      'Server is missing its original Pterodactyl connection association',
      500,
      'MISSING_CONNECTION_ASSOCIATION'
    );
  }

  const conn = await panelConnectionModel.findEncryptedById(server.connection_id);
  if (!conn) {
    throw new NotFoundError('Original Pterodactyl connection not found', {}, 'CONNECTION_NOT_FOUND');
  }
  if (!conn.is_enabled) {
    throw new AppError(
      'Original Pterodactyl connection is currently disabled',
      503,
      'CONNECTION_DISABLED'
    );
  }

  const apiKey = decryptSecret(conn.api_key_encrypted);
  const identifier =
    server.provider_metadata?.identifier ||
    server.external_server_id;

  return {
    panelUrl: conn.panel_url,
    apiKey,
    externalServerId: server.external_server_id,
    identifier,
  };
}

/**
 * List servers owned by the authenticated customer (or all for admin) with DB-level pagination & filtering.
 */
async function listServers(actorUser, { status = null, provider_key = null, limit = 20, offset = 0 } = {}) {
  const { servers, total } = await panelServerModel.findPaginated({
    userId: actorUser.id,
    isAdmin: actorUser.role === 'admin',
    status,
    providerKey: provider_key,
    limit,
    offset,
  });

  return {
    total,
    limit,
    offset,
    servers: servers.map(toSafeServerView),
  };
}

/**
 * Retrieve details for an owned server, including package metadata and live provider details where supported.
 */
async function getServerDetails(actorUser, serverId) {
  const { server, provider } = await loadOwnedServerAndProvider(actorUser, serverId);
  const pkg = server.package_id ? await serverPackageModel.findById(server.package_id) : null;

  let liveDetails = null;
  let liveStatus = provider.supports('getServerDetails') ? 'available' : 'unsupported';

  if (provider.supports('getServerDetails') && server.provider_key === 'pterodactyl') {
    try {
      const ctx = await resolvePterodactylServerContext(server);
      liveDetails = await provider.getServerDetails({
        panelUrl: ctx.panelUrl,
        apiKey: ctx.apiKey,
        externalServerId: ctx.externalServerId,
      });
    } catch (err) {
      liveStatus = 'unavailable';
      liveDetails = { error: err.message };
    }
  }

  return {
    server: toSafeServerView(server),
    package: pkg
      ? {
          id: pkg.id,
          name: pkg.name,
          memory_mb: pkg.memory_mb,
          disk_mb: pkg.disk_mb,
          cpu_percent: pkg.cpu_percent,
        }
      : null,
    capabilities: { ...provider.capabilities },
    live_status: liveStatus,
    live_details: liveDetails,
  };
}

/**
 * Execute a power signal ('start' | 'stop' | 'restart') on an owned server.
 * Rejects providers without `setPowerState` capability (e.g. BWM XMD) with 501.
 */
async function sendPowerAction(actorUser, serverId, signal, reqMeta = {}) {
  const { server, provider } = await loadOwnedServerAndProvider(actorUser, serverId);

  // Never simulate power controls for unsupported providers
  provider.assertSupported('setPowerState');

  try {
    const ctx = await resolvePterodactylServerContext(server);
    if (!ctx.identifier) {
      throw new BadRequestError(
        'Server does not have a valid Pterodactyl identifier for power control',
        {},
        'MISSING_SERVER_IDENTIFIER'
      );
    }

    const result = await provider.setPowerState({
      panelUrl: ctx.panelUrl,
      apiKey: ctx.apiKey,
      identifier: ctx.identifier,
      signal,
    });

    await auditLogModel.createAuditLog({
      userId: actorUser.id,
      action: `SERVER_POWER_${signal.toUpperCase()}`,
      resourceType: 'panel_server',
      resourceId: server.id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      status: 'success',
      details: { provider_key: server.provider_key, signal },
    });

    return {
      server_id: server.id,
      signal,
      accepted: Boolean(result?.accepted),
    };
  } catch (err) {
    await auditLogModel.createAuditLog({
      userId: actorUser.id,
      action: `SERVER_POWER_${signal.toUpperCase()}_FAILED`,
      resourceType: 'panel_server',
      resourceId: server.id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      status: 'failed',
      details: { provider_key: server.provider_key, signal, code: err.code },
    });
    throw err;
  }
}

/**
 * Retrieve live resource utilization for an owned server where supported.
 */
async function getServerResources(actorUser, serverId) {
  const { server, provider } = await loadOwnedServerAndProvider(actorUser, serverId);
  provider.assertSupported('getServerResources');

  const ctx = await resolvePterodactylServerContext(server);
  if (!ctx.identifier) {
    throw new BadRequestError(
      'Server does not have a valid Pterodactyl identifier',
      {},
      'MISSING_SERVER_IDENTIFIER'
    );
  }

  const resources = await provider.getServerResources({
    panelUrl: ctx.panelUrl,
    apiKey: ctx.apiKey,
    identifier: ctx.identifier,
  });

  return {
    server_id: server.id,
    resources,
  };
}

module.exports = {
  listServers,
  getServerDetails,
  sendPowerAction,
  getServerResources,
};

