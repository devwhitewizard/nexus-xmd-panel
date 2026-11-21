const panelConnectionModel = require('../models/panelConnection.model');
const panelResourceModel = require('../models/panelResource.model');
const auditLogModel = require('../models/auditLog.model');
const { providerManager } = require('../providers/providerManager');
const { decryptSecret } = require('../utils/crypto');
const { BadRequestError, ConflictError, NotFoundError } = require('../utils/errors');

// Tracks in-flight discovery refreshes per connectionId to prevent concurrent overwrites
const activeRefreshes = new Map();

function buildEmptyResourceView(connectionId) {
  return {
    connection_id: connectionId,
    discovery_status: 'pending',
    discovered_nests: [],
    discovered_eggs: [],
    discovered_locations: [],
    discovered_nodes: [],
    discovered_allocations: [],
    manual_overrides: {},
    last_synced_at: null,
    last_attempted_at: null,
    last_error: null,
  };
}

async function getResources(connectionId) {
  const conn = await panelConnectionModel.findById(connectionId);
  if (!conn) {
    throw new NotFoundError('Panel connection not found', {}, 'CONNECTION_NOT_FOUND');
  }

  const record = await panelResourceModel.findByConnectionId(connectionId);
  return record || buildEmptyResourceView(connectionId);
}

/**
 * Synchronize nests, eggs, locations, nodes, and allocations from a Pterodactyl panel.
 * Prevents concurrent refreshes on the same connection and preserves prior snapshots on failure.
 */
async function refreshResources(adminUser, connectionId, reqMeta = {}) {
  if (activeRefreshes.has(connectionId)) {
    throw new ConflictError(
      'Resource discovery is already in progress for this connection',
      {},
      'DISCOVERY_ALREADY_IN_PROGRESS'
    );
  }

  const conn = await panelConnectionModel.findEncryptedById(connectionId);
  if (!conn) {
    throw new NotFoundError('Panel connection not found', {}, 'CONNECTION_NOT_FOUND');
  }

  activeRefreshes.set(connectionId, true);
  const apiKey = decryptSecret(conn.api_key_encrypted);
  const pteroProvider = providerManager.getProvider('pterodactyl');

  try {
    const discovered = await pteroProvider.discoverResources({
      panelUrl: conn.panel_url,
      apiKey,
    });

    const saved = await panelResourceModel.upsertDiscoverySuccess(connectionId, discovered);

    await auditLogModel.createAuditLog({
      userId: adminUser.id,
      action: 'PANEL_RESOURCES_REFRESHED',
      resourceType: 'panel_connection',
      resourceId: connectionId,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      status: 'success',
      details: {
        nests: discovered.nests.length,
        eggs: discovered.eggs.length,
        locations: discovered.locations.length,
        nodes: discovered.nodes.length,
        allocations: discovered.allocations.length,
      },
    });

    return saved;
  } catch (err) {
    await panelResourceModel.recordDiscoveryFailure(connectionId, err.message);

    await auditLogModel.createAuditLog({
      userId: adminUser.id,
      action: 'PANEL_RESOURCES_REFRESH_FAILED',
      resourceType: 'panel_connection',
      resourceId: connectionId,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      status: 'failed',
      details: { code: err.code, message: err.message },
    });

    throw err;
  } finally {
    activeRefreshes.delete(connectionId);
  }
}

async function updateManualConfiguration(adminUser, connectionId, overridesInput, reqMeta = {}) {
  const conn = await panelConnectionModel.findById(connectionId);
  if (!conn) {
    throw new NotFoundError('Panel connection not found', {}, 'CONNECTION_NOT_FOUND');
  }

  const resourceRecord = await panelResourceModel.findByConnectionId(connectionId);
  if (!resourceRecord || !resourceRecord.last_synced_at) {
    throw new BadRequestError(
      'Resources must be discovered for this connection before configuring manual overrides',
      {},
      'RESOURCES_NOT_SYNCED'
    );
  }

  const nextOverrides = { ...(resourceRecord.manual_overrides || {}) };
  for (const key of ['nest_id', 'egg_id', 'location_id', 'node_id', 'allocation_id']) {
    if (Object.prototype.hasOwnProperty.call(overridesInput, key)) {
      if (overridesInput[key] === null) {
        delete nextOverrides[key];
      } else {
        nextOverrides[key] = overridesInput[key];
      }
    }
  }

  const nests = resourceRecord.discovered_nests || [];
  const eggs = resourceRecord.discovered_eggs || [];
  const locations = resourceRecord.discovered_locations || [];
  const nodes = resourceRecord.discovered_nodes || [];
  const allocations = resourceRecord.discovered_allocations || [];

  if (nextOverrides.nest_id !== undefined) {
    const nestExists = nests.some((n) => n.id === nextOverrides.nest_id);
    if (!nestExists) {
      throw new BadRequestError(
        `Nest ID ${nextOverrides.nest_id} does not exist on this panel connection`,
        {},
        'INVALID_NEST_ID'
      );
    }
  }

  if (nextOverrides.egg_id !== undefined) {
    const egg = eggs.find((e) => e.id === nextOverrides.egg_id);
    if (!egg) {
      throw new BadRequestError(
        `Egg ID ${nextOverrides.egg_id} does not exist on this panel connection`,
        {},
        'INVALID_EGG_ID'
      );
    }
    if (nextOverrides.nest_id !== undefined && egg.nest_id !== nextOverrides.nest_id) {
      throw new BadRequestError(
        `Egg ID ${nextOverrides.egg_id} does not belong to Nest ID ${nextOverrides.nest_id}`,
        {},
        'EGG_NEST_MISMATCH'
      );
    }
  }

  if (nextOverrides.location_id !== undefined) {
    const locExists = locations.some((l) => l.id === nextOverrides.location_id);
    if (!locExists) {
      throw new BadRequestError(
        `Location ID ${nextOverrides.location_id} does not exist on this panel connection`,
        {},
        'INVALID_LOCATION_ID'
      );
    }
  }

  if (nextOverrides.node_id !== undefined) {
    const nodeExists = nodes.some((n) => n.id === nextOverrides.node_id);
    if (!nodeExists) {
      throw new BadRequestError(
        `Node ID ${nextOverrides.node_id} does not exist on this panel connection`,
        {},
        'INVALID_NODE_ID'
      );
    }
  }

  if (nextOverrides.allocation_id !== undefined) {
    const alloc = allocations.find((a) => a.id === nextOverrides.allocation_id);
    if (!alloc) {
      throw new BadRequestError(
        `Allocation ID ${nextOverrides.allocation_id} does not exist on this panel connection`,
        {},
        'INVALID_ALLOCATION_ID'
      );
    }
    if (nextOverrides.node_id !== undefined && alloc.node_id !== nextOverrides.node_id) {
      throw new BadRequestError(
        `Allocation ID ${nextOverrides.allocation_id} does not belong to Node ID ${nextOverrides.node_id}`,
        {},
        'ALLOCATION_NODE_MISMATCH'
      );
    }
  }

  const updated = await panelResourceModel.updateManualOverrides(connectionId, nextOverrides);

  await auditLogModel.createAuditLog({
    userId: adminUser.id,
    action: 'PANEL_RESOURCES_CONFIGURED',
    resourceType: 'panel_connection',
    resourceId: connectionId,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    status: 'success',
    details: { manual_overrides: nextOverrides },
  });

  return updated;
}

module.exports = {
  getResources,
  refreshResources,
  updateManualConfiguration,
};

