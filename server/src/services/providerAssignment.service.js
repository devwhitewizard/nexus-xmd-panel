const serverPackageModel = require('../models/serverPackage.model');
const panelConnectionModel = require('../models/panelConnection.model');
const orderModel = require('../models/order.model');
const platformSettingModel = require('../models/platformSetting.model');
const auditLogModel = require('../models/auditLog.model');
const { providerManager } = require('../providers/providerManager');
const serverPackageService = require('./serverPackage.service');
const {
  AppError,
  BadRequestError,
  NotFoundError,
} = require('../utils/errors');

/**
 * Operational capability matrix distinguishing declared capabilities from
 * capabilities currently implemented in the active codebase.
 * Prevents advertising pending Pterodactyl provisioning/power operations as ready.
 */
const IMPLEMENTED_CAPABILITIES = Object.freeze({
  'bwm-xmd': {
    testConnection: true,
    discoverResources: true,
    provisionServer: true,
    getServerDetails: false,
    setPowerState: false,
    getServerResources: false,
  },
  pterodactyl: {
    testConnection: true,
    discoverResources: true,
    provisionServer: true,
    getServerDetails: true,
    setPowerState: true,
    getServerResources: true,
  },
});

/**
 * Check whether an infrastructure provider is globally enabled in platform_settings.
 * Defaults to true if no explicit override setting exists.
 * @param {string} providerKey
 * @returns {Promise<boolean>}
 */
async function isProviderEnabled(providerKey) {
  try {
    const setting = await platformSettingModel.getSetting(`provider_status:${providerKey}`);
    if (setting && setting.value && typeof setting.value.is_enabled === 'boolean') {
      return setting.value.is_enabled;
    }
  } catch {
    // If settings table has no record or is unavailable, default to enabled
  }
  return true;
}

/**
 * List all registered providers with declared vs implemented capabilities and status.
 * @returns {Promise<Array<Object>>}
 */
async function listProvidersWithStatus() {
  const descriptors = providerManager.listProviders();
  return Promise.all(
    descriptors.map(async (desc) => {
      const enabled = await isProviderEnabled(desc.key);
      return {
        key: desc.key,
        name: desc.name,
        requires_connection_config: desc.requires_connection_config,
        is_enabled: enabled,
        declared_capabilities: desc.capabilities,
        implemented_capabilities: IMPLEMENTED_CAPABILITIES[desc.key] || {},
      };
    })
  );
}

/**
 * Retrieve and validate a Pterodactyl connection for a given providerKey.
 * BWM XMD uses server-side .env configuration and must never have a connectionId.
 * @param {string} providerKey
 * @param {string|null} connectionId
 * @returns {Promise<Object|null>}
 */
async function getProviderConnection(providerKey, connectionId = null) {
  if (providerKey === 'bwm-xmd') {
    if (connectionId) {
      throw new BadRequestError(
        'BWM XMD does not use Pterodactyl panel connections',
        {},
        'PACKAGE_PROVIDER_MISMATCH'
      );
    }
    return null;
  }

  if (providerKey === 'pterodactyl') {
    if (!connectionId) {
      throw new BadRequestError(
        'Pterodactyl provider requires a valid connection_id',
        {},
        'INVALID_PROVIDER_ASSIGNMENT'
      );
    }
    const connection = await panelConnectionModel.findById(connectionId);
    if (!connection) {
      throw new NotFoundError('Pterodactyl connection not found', {}, 'CONNECTION_NOT_FOUND');
    }
    if (!connection.is_enabled) {
      throw new AppError(
        'Assigned Pterodactyl connection is disabled',
        400,
        'CONNECTION_DISABLED',
        { connection_id: connectionId }
      );
    }
    if (connection.connection_status === 'failed') {
      throw new AppError(
        'Assigned Pterodactyl connection is currently unavailable (last health check failed)',
        503,
        'PROVIDER_UNAVAILABLE',
        { connection_id: connectionId }
      );
    }
    return connection;
  }

  throw new BadRequestError(
    `Unsupported provider "${providerKey}"`,
    {},
    'UNSUPPORTED_PROVIDER'
  );
}

/**
 * Assert that a registered provider and optional connection are enabled and available.
 * Never falls back automatically to another provider.
 * @param {string} providerKey
 * @param {string|null} connectionId
 * @returns {Promise<{ provider: Object, connection: Object|null }>}
 */
async function assertProviderAvailable(providerKey, connectionId = null) {
  let provider;
  try {
    provider = providerManager.getProvider(providerKey);
  } catch {
    throw new BadRequestError(
      `Provider "${providerKey}" is not registered`,
      {},
      'UNSUPPORTED_PROVIDER'
    );
  }

  const enabled = await isProviderEnabled(provider.key);
  if (!enabled) {
    throw new AppError(
      `Provider "${provider.key}" is currently disabled by an administrator`,
      503,
      'PROVIDER_DISABLED',
      { provider: provider.key }
    );
  }

  const connection = await getProviderConnection(provider.key, connectionId);
  return { provider, connection };
}

/**
 * Validate a proposed package/provider assignment before saving.
 * @param {Object} packageData
 * @returns {Promise<{ provider: Object, connection: Object|null }>}
 */
async function validateProviderAssignment(packageData) {
  const { provider, connection } = await assertProviderAvailable(
    packageData.provider_key,
    packageData.connection_id ?? null
  );

  await serverPackageService.validatePackageConfiguration(packageData);
  return { provider, connection };
}

/**
 * Build an immutable provider assignment snapshot for an order.
 * Preserves agreed price, resource limits, and infrastructure target regardless of future edits.
 * @param {Object} pkg
 * @returns {Object}
 */
function buildOrderAssignmentSnapshot(pkg) {
  return {
    provider_key: pkg.provider_key,
    connection_id: pkg.connection_id || null,
    package_id: pkg.id,
    package_name: pkg.name,
    agreed_price: pkg.price,
    currency: pkg.currency,
    resource_limits: {
      memory_mb: pkg.memory_mb,
      disk_mb: pkg.disk_mb,
      cpu_percent: pkg.cpu_percent,
      swap_mb: pkg.swap_mb,
      io_weight: pkg.io_weight,
      database_limit: pkg.database_limit,
      backup_limit: pkg.backup_limit,
      allocation_limit: pkg.allocation_limit,
    },
    pterodactyl_resources:
      pkg.provider_key === 'pterodactyl'
        ? {
            nest_id: pkg.nest_id,
            egg_id: pkg.egg_id,
            location_id: pkg.location_id,
            node_id: pkg.node_id,
            allocation_id: pkg.allocation_id,
            egg_environment: pkg.egg_environment || {},
          }
        : null,
    bwm_plan_id: pkg.provider_key === 'bwm-xmd' ? pkg.bwm_plan_id : null,
    assigned_at: new Date().toISOString(),
  };
}

/**
 * Resolve the authoritative provider and connection for a package from trusted DB records.
 * Ignores any customer-supplied provider or connection overrides.
 * @param {string} packageId
 * @returns {Promise<Object>}
 */
async function resolveProviderForPackage(packageId) {
  const pkg = await serverPackageModel.findById(packageId);
  if (!pkg) {
    throw new NotFoundError('Server package not found', {}, 'PACKAGE_NOT_FOUND');
  }

  if (!pkg.is_enabled) {
    throw new BadRequestError('Server package is disabled', {}, 'PACKAGE_DISABLED');
  }

  const { provider, connection } = await assertProviderAvailable(
    pkg.provider_key,
    pkg.connection_id
  );

  const availability = await serverPackageService.checkPackageAvailability(pkg);
  if (!availability.available) {
    throw new AppError(
      availability.reasons[0] || 'Package resource configuration is stale or unavailable',
      400,
      'RESOURCE_CONFIGURATION_STALE',
      { availability }
    );
  }

  const snapshot = buildOrderAssignmentSnapshot(pkg);

  return {
    provider_key: provider.key,
    provider,
    connection_id: connection ? connection.id : null,
    connection,
    package_id: pkg.id,
    validated_config: snapshot,
    declared_capabilities: { ...provider.capabilities },
    implemented_capabilities: IMPLEMENTED_CAPABILITIES[provider.key] || {},
    availability,
  };
}

/**
 * Resolve the historical provider assignment for an existing order.
 * Uses the immutable `provider_assignment_snapshot` when present so subsequent
 * package edits or disabled connections never rewrite historical order records.
 * @param {string} orderId
 * @returns {Promise<Object>}
 */
async function resolveProviderForOrder(orderId) {
  const order = await orderModel.findById(orderId);
  if (!order) {
    throw new NotFoundError('Order not found', {}, 'ORDER_NOT_FOUND');
  }

  const snapshot = order.provider_assignment_snapshot;
  const providerKey = snapshot?.provider_key || order.provider_key || null;

  if (!providerKey) {
    return {
      order_id: order.id,
      is_legacy: true,
      provider_key: null,
      provider: null,
      connection_id: null,
      package_id: order.package_id || null,
      snapshot: null,
    };
  }

  const provider = providerManager.getProvider(providerKey);

  return {
    order_id: order.id,
    is_legacy: false,
    provider_key: provider.key,
    provider,
    connection_id: snapshot?.connection_id ?? order.connection_id ?? null,
    package_id: snapshot?.package_id ?? order.package_id ?? null,
    snapshot: snapshot || null,
    declared_capabilities: { ...provider.capabilities },
    implemented_capabilities: IMPLEMENTED_CAPABILITIES[provider.key] || {},
  };
}

/**
 * Admin: List all packages with their current provider assignment and validation status.
 * @returns {Promise<Array<Object>>}
 */
async function listPackageAssignmentsAdmin() {
  const packages = await serverPackageModel.findAll();
  return Promise.all(
    packages.map(async (pkg) => {
      const availability = await serverPackageService.checkPackageAvailability(pkg);
      return {
        package_id: pkg.id,
        package_name: pkg.name,
        is_enabled: pkg.is_enabled,
        provider_key: pkg.provider_key,
        connection_id: pkg.connection_id,
        bwm_plan_id: pkg.bwm_plan_id,
        nest_id: pkg.nest_id,
        egg_id: pkg.egg_id,
        location_id: pkg.location_id,
        node_id: pkg.node_id,
        allocation_id: pkg.allocation_id,
        availability,
      };
    })
  );
}

/**
 * Admin: View a single package's provider assignment and validation status.
 * @param {string} packageId
 * @returns {Promise<Object>}
 */
async function getPackageAssignmentAdmin(packageId) {
  const pkg = await serverPackageModel.findById(packageId);
  if (!pkg) {
    throw new NotFoundError('Server package not found', {}, 'PACKAGE_NOT_FOUND');
  }
  const availability = await serverPackageService.checkPackageAvailability(pkg);
  return {
    package_id: pkg.id,
    package_name: pkg.name,
    is_enabled: pkg.is_enabled,
    provider_key: pkg.provider_key,
    connection_id: pkg.connection_id,
    bwm_plan_id: pkg.bwm_plan_id,
    nest_id: pkg.nest_id,
    egg_id: pkg.egg_id,
    location_id: pkg.location_id,
    node_id: pkg.node_id,
    allocation_id: pkg.allocation_id,
    availability,
  };
}

/**
 * Admin: Assign or change the provider and connection for future orders on a package.
 * Existing orders and servers retain their original provider association.
 * @param {Object} adminUser
 * @param {string} packageId
 * @param {Object} payload
 * @param {Object} reqMeta
 * @returns {Promise<Object>}
 */
async function assignProviderToPackage(adminUser, packageId, payload, reqMeta = {}) {
  const existing = await serverPackageModel.findById(packageId);
  if (!existing) {
    throw new NotFoundError('Server package not found', {}, 'PACKAGE_NOT_FOUND');
  }

  const nextProvider = payload.provider_key;
  const candidate = {
    ...existing,
    provider_key: nextProvider,
    connection_id: nextProvider === 'pterodactyl' ? payload.connection_id ?? null : null,
    bwm_plan_id: nextProvider === 'bwm-xmd' ? payload.bwm_plan_id ?? existing.bwm_plan_id : null,
    nest_id: nextProvider === 'pterodactyl' ? payload.nest_id ?? existing.nest_id : null,
    egg_id: nextProvider === 'pterodactyl' ? payload.egg_id ?? existing.egg_id : null,
    location_id:
      nextProvider === 'pterodactyl'
        ? payload.location_id !== undefined
          ? payload.location_id
          : existing.location_id
        : null,
    node_id:
      nextProvider === 'pterodactyl'
        ? payload.node_id !== undefined
          ? payload.node_id
          : existing.node_id
        : null,
    allocation_id:
      nextProvider === 'pterodactyl'
        ? payload.allocation_id !== undefined
          ? payload.allocation_id
          : existing.allocation_id
        : null,
  };

  await validateProviderAssignment(candidate);

  const updated = await serverPackageModel.updateById(packageId, candidate);

  await auditLogModel.createAuditLog({
    userId: adminUser.id,
    action: 'PACKAGE_PROVIDER_ASSIGNED',
    resourceType: 'server_package',
    resourceId: packageId,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    status: 'success',
    details: {
      previous_provider: existing.provider_key,
      previous_connection_id: existing.connection_id,
      new_provider: updated.provider_key,
      new_connection_id: updated.connection_id,
    },
  });

  return getPackageAssignmentAdmin(packageId);
}

/**
 * Admin: Validate a package's current provider assignment without modifying it.
 * @param {string} packageId
 * @returns {Promise<Object>}
 */
async function validatePackageAssignmentAdmin(packageId) {
  const resolved = await resolveProviderForPackage(packageId);
  return {
    valid: true,
    package_id: resolved.package_id,
    provider_key: resolved.provider_key,
    connection_id: resolved.connection_id,
    declared_capabilities: resolved.declared_capabilities,
    implemented_capabilities: resolved.implemented_capabilities,
    availability: resolved.availability,
  };
}

module.exports = {
  IMPLEMENTED_CAPABILITIES,
  isProviderEnabled,
  listProvidersWithStatus,
  getProviderConnection,
  assertProviderAvailable,
  validateProviderAssignment,
  buildOrderAssignmentSnapshot,
  resolveProviderForPackage,
  resolveProviderForOrder,
  listPackageAssignmentsAdmin,
  getPackageAssignmentAdmin,
  assignProviderToPackage,
  validatePackageAssignmentAdmin,
};

