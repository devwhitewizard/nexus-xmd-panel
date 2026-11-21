const serverPackageModel = require('../models/serverPackage.model');
const panelConnectionModel = require('../models/panelConnection.model');
const panelResourceModel = require('../models/panelResource.model');
const auditLogModel = require('../models/auditLog.model');
const { providerManager } = require('../providers/providerManager');
const bwmPanelsService = require('./bwm/panels.service');
const { BadRequestError, ConflictError, NotFoundError } = require('../utils/errors');

/**
 * Strip internal provider connection IDs and infrastructure metadata for customer views.
 * Customers must only see package specifications, pricing, and availability.
 * @param {Object} pkg
 * @param {Object} availability
 * @returns {Object}
 */
function toCustomerPackageView(pkg, availability) {
  return {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description,
    price: pkg.price,
    currency: pkg.currency,
    memory_mb: pkg.memory_mb,
    disk_mb: pkg.disk_mb,
    cpu_percent: pkg.cpu_percent,
    swap_mb: pkg.swap_mb,
    io_weight: pkg.io_weight,
    database_limit: pkg.database_limit,
    backup_limit: pkg.backup_limit,
    allocation_limit: pkg.allocation_limit,
    available: availability.available,
    created_at: pkg.created_at,
  };
}

/**
 * Validate Pterodactyl package resources against the connection's latest successful discovery snapshot.
 * Ensures nest, egg, location, node, and allocation exist on the target panel and relationships match.
 * @param {Object} pkgData
 * @returns {Promise<void>}
 */
async function validatePterodactylPackageResources(pkgData) {
  if (!pkgData.connection_id) {
    throw new BadRequestError(
      'Pterodactyl packages require a valid connection_id',
      {},
      'CONNECTION_ID_REQUIRED'
    );
  }

  const connection = await panelConnectionModel.findById(pkgData.connection_id);
  if (!connection) {
    throw new NotFoundError('Referenced Pterodactyl connection not found', {}, 'CONNECTION_NOT_FOUND');
  }
  if (!connection.is_enabled) {
    throw new BadRequestError(
      'Cannot assign package to a disabled Pterodactyl connection',
      {},
      'CONNECTION_DISABLED'
    );
  }

  const resources = await panelResourceModel.findByConnectionId(pkgData.connection_id);
  if (!resources || !resources.last_synced_at) {
    throw new BadRequestError(
      'Pterodactyl connection must complete resource discovery before creating packages',
      {},
      'RESOURCES_NOT_SYNCED'
    );
  }

  if (!Number.isInteger(pkgData.nest_id) || !Number.isInteger(pkgData.egg_id)) {
    throw new BadRequestError(
      'Pterodactyl packages require both nest_id and egg_id',
      {},
      'NEST_AND_EGG_REQUIRED'
    );
  }

  const nests = resources.discovered_nests || [];
  const eggs = resources.discovered_eggs || [];
  const locations = resources.discovered_locations || [];
  const nodes = resources.discovered_nodes || [];
  const allocations = resources.discovered_allocations || [];

  const nest = nests.find((n) => n.id === pkgData.nest_id);
  if (!nest) {
    throw new BadRequestError(
      `Nest ID ${pkgData.nest_id} was not found in the latest discovery snapshot for this connection`,
      {},
      'INVALID_NEST_ID'
    );
  }

  const egg = eggs.find((e) => e.id === pkgData.egg_id);
  if (!egg) {
    throw new BadRequestError(
      `Egg ID ${pkgData.egg_id} was not found in the latest discovery snapshot for this connection`,
      {},
      'INVALID_EGG_ID'
    );
  }

  if (egg.nest_id !== pkgData.nest_id) {
    throw new BadRequestError(
      `Egg ID ${pkgData.egg_id} does not belong to Nest ID ${pkgData.nest_id}`,
      {},
      'EGG_NEST_MISMATCH'
    );
  }

  if (pkgData.location_id !== null && pkgData.location_id !== undefined) {
    const loc = locations.find((l) => l.id === pkgData.location_id);
    if (!loc) {
      throw new BadRequestError(
        `Location ID ${pkgData.location_id} was not found on this connection`,
        {},
        'INVALID_LOCATION_ID'
      );
    }
  }

  if (pkgData.node_id !== null && pkgData.node_id !== undefined) {
    const node = nodes.find((n) => n.id === pkgData.node_id);
    if (!node) {
      throw new BadRequestError(
        `Node ID ${pkgData.node_id} was not found on this connection`,
        {},
        'INVALID_NODE_ID'
      );
    }
  }

  if (pkgData.allocation_id !== null && pkgData.allocation_id !== undefined) {
    const alloc = allocations.find((a) => a.id === pkgData.allocation_id);
    if (!alloc) {
      throw new BadRequestError(
        `Allocation ID ${pkgData.allocation_id} was not found on this connection`,
        {},
        'INVALID_ALLOCATION_ID'
      );
    }
    if (
      pkgData.node_id !== null &&
      pkgData.node_id !== undefined &&
      alloc.node_id !== pkgData.node_id
    ) {
      throw new BadRequestError(
        `Allocation ID ${pkgData.allocation_id} does not belong to Node ID ${pkgData.node_id}`,
        {},
        'ALLOCATION_NODE_MISMATCH'
      );
    }
  }
}

/**
 * Validate BWM XMD package configuration without requiring Pterodactyl resources.
 * If bwm_plan_id is supplied, verifies it against live BWM plans.
 * @param {Object} pkgData
 * @returns {Promise<void>}
 */
async function validateBwmPackage(pkgData) {
  if (pkgData.connection_id) {
    throw new BadRequestError(
      'BWM XMD packages must not reference a Pterodactyl connection_id',
      {},
      'INVALID_BWM_CONNECTION'
    );
  }

  if (pkgData.bwm_plan_id) {
    const plansPayload = await bwmPanelsService.getPlans();
    const plans = Array.isArray(plansPayload?.plans) ? plansPayload.plans : [];
    const exists = plans.some((p) => p.id === pkgData.bwm_plan_id);
    if (!exists) {
      throw new BadRequestError(
        `BWM plan "${pkgData.bwm_plan_id}" is not available in live BWM panel plans`,
        {},
        'INVALID_BWM_PLAN'
      );
    }
  }
}

/**
 * Validate a package configuration against its assigned provider and capabilities.
 * @param {Object} pkgData
 * @returns {Promise<void>}
 */
async function validatePackageConfiguration(pkgData) {
  providerManager.assertCapability(pkgData.provider_key, 'provisionServer');

  if (pkgData.provider_key === 'pterodactyl') {
    await validatePterodactylPackageResources(pkgData);
  } else if (pkgData.provider_key === 'bwm-xmd') {
    await validateBwmPackage(pkgData);
  }
}

/**
 * Compute real-time purchasability of a package, distinguishing configuration errors
 * (stale/missing resources) from provider availability issues (disabled/failed connection).
 * @param {Object} pkg
 * @returns {Promise<{ available: boolean, status: string, reasons: string[] }>}
 */
async function checkPackageAvailability(pkg) {
  const reasons = [];
  let status = 'available';

  if (!pkg.is_enabled) {
    return {
      available: false,
      status: 'disabled',
      reasons: ['Package is disabled'],
    };
  }

  if (!providerManager.hasCapability(pkg.provider_key, 'provisionServer')) {
    return {
      available: false,
      status: 'unavailable_provider',
      reasons: [`Provider "${pkg.provider_key}" does not support server provisioning`],
    };
  }

  if (pkg.provider_key === 'pterodactyl') {
    if (!pkg.connection_id) {
      return {
        available: false,
        status: 'unavailable_config',
        reasons: ['Package is missing a Pterodactyl connection'],
      };
    }

    const connection = await panelConnectionModel.findById(pkg.connection_id);
    if (!connection) {
      return {
        available: false,
        status: 'unavailable_provider',
        reasons: ['Assigned Pterodactyl connection no longer exists'],
      };
    }
    if (!connection.is_enabled) {
      return {
        available: false,
        status: 'unavailable_provider',
        reasons: ['Assigned Pterodactyl connection is disabled'],
      };
    }
    if (connection.connection_status === 'failed') {
      return {
        available: false,
        status: 'unavailable_provider',
        reasons: ['Assigned Pterodactyl connection failed its last health check'],
      };
    }

    const resources = await panelResourceModel.findByConnectionId(pkg.connection_id);
    if (!resources || !resources.last_synced_at) {
      return {
        available: false,
        status: 'unavailable_config',
        reasons: ['Pterodactyl resources have not been synchronized'],
      };
    }

    const nests = resources.discovered_nests || [];
    const eggs = resources.discovered_eggs || [];
    const locations = resources.discovered_locations || [];
    const nodes = resources.discovered_nodes || [];
    const allocations = resources.discovered_allocations || [];

    if (!nests.some((n) => n.id === pkg.nest_id)) {
      status = 'unavailable_config';
      reasons.push(`Configured Nest ID ${pkg.nest_id} is no longer present on the panel`);
    }
    const egg = eggs.find((e) => e.id === pkg.egg_id);
    if (!egg || egg.nest_id !== pkg.nest_id) {
      status = 'unavailable_config';
      reasons.push(`Configured Egg ID ${pkg.egg_id} is missing or does not match Nest ID ${pkg.nest_id}`);
    }
    if (pkg.location_id && !locations.some((l) => l.id === pkg.location_id)) {
      status = 'unavailable_config';
      reasons.push(`Configured Location ID ${pkg.location_id} is no longer present`);
    }
    if (pkg.node_id && !nodes.some((n) => n.id === pkg.node_id)) {
      status = 'unavailable_config';
      reasons.push(`Configured Node ID ${pkg.node_id} is no longer present`);
    }
    if (pkg.allocation_id) {
      const alloc = allocations.find((a) => a.id === pkg.allocation_id);
      if (!alloc || (pkg.node_id && alloc.node_id !== pkg.node_id)) {
        status = 'unavailable_config';
        reasons.push(`Configured Allocation ID ${pkg.allocation_id} is missing or mismatched`);
      }
    }
  }

  return {
    available: reasons.length === 0,
    status: reasons.length === 0 ? 'available' : status,
    reasons,
  };
}

/**
 * Create a new server package (Admin only).
 * @param {Object} adminUser
 * @param {Object} payload
 * @param {Object} reqMeta
 * @returns {Promise<Object>}
 */
async function createPackage(adminUser, payload, reqMeta = {}) {
  await validatePackageConfiguration(payload);

  const created = await serverPackageModel.createPackage({
    ...payload,
    created_by: adminUser.id,
  });

  await auditLogModel.createAuditLog({
    userId: adminUser.id,
    action: 'SERVER_PACKAGE_CREATED',
    resourceType: 'server_package',
    resourceId: created.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    status: 'success',
    details: { name: created.name, provider_key: created.provider_key, price: created.price },
  });

  return created;
}

/**
 * List all packages with availability diagnostics (Admin only).
 * @returns {Promise<Array<Object>>}
 */
async function listAllPackagesAdmin() {
  const packages = await serverPackageModel.findAll();
  return Promise.all(
    packages.map(async (pkg) => ({
      ...pkg,
      availability: await checkPackageAvailability(pkg),
    }))
  );
}

/**
 * Get a single package with availability diagnostics (Admin only).
 * @param {string} id
 * @returns {Promise<Object>}
 */
async function getPackageAdmin(id) {
  const pkg = await serverPackageModel.findById(id);
  if (!pkg) {
    throw new NotFoundError('Server package not found', {}, 'PACKAGE_NOT_FOUND');
  }
  return {
    ...pkg,
    availability: await checkPackageAvailability(pkg),
  };
}

/**
 * Update an existing server package (Admin only).
 * @param {Object} adminUser
 * @param {string} id
 * @param {Object} payload
 * @param {Object} reqMeta
 * @returns {Promise<Object>}
 */
async function updatePackage(adminUser, id, payload, reqMeta = {}) {
  const existing = await serverPackageModel.findById(id);
  if (!existing) {
    throw new NotFoundError('Server package not found', {}, 'PACKAGE_NOT_FOUND');
  }

  const merged = {
    name: payload.name ?? existing.name,
    description: payload.description !== undefined ? payload.description : existing.description,
    price: payload.price !== undefined ? payload.price : existing.price,
    currency: payload.currency ?? existing.currency,
    provider_key: payload.provider_key ?? existing.provider_key,
    connection_id:
      payload.connection_id !== undefined ? payload.connection_id : existing.connection_id,
    bwm_plan_id: payload.bwm_plan_id !== undefined ? payload.bwm_plan_id : existing.bwm_plan_id,
    memory_mb: payload.memory_mb ?? existing.memory_mb,
    disk_mb: payload.disk_mb ?? existing.disk_mb,
    cpu_percent: payload.cpu_percent ?? existing.cpu_percent,
    swap_mb: payload.swap_mb ?? existing.swap_mb,
    io_weight: payload.io_weight ?? existing.io_weight,
    database_limit: payload.database_limit ?? existing.database_limit,
    backup_limit: payload.backup_limit ?? existing.backup_limit,
    allocation_limit: payload.allocation_limit ?? existing.allocation_limit,
    nest_id: payload.nest_id !== undefined ? payload.nest_id : existing.nest_id,
    egg_id: payload.egg_id !== undefined ? payload.egg_id : existing.egg_id,
    location_id: payload.location_id !== undefined ? payload.location_id : existing.location_id,
    node_id: payload.node_id !== undefined ? payload.node_id : existing.node_id,
    allocation_id:
      payload.allocation_id !== undefined ? payload.allocation_id : existing.allocation_id,
    egg_environment:
      payload.egg_environment !== undefined ? payload.egg_environment : existing.egg_environment,
    is_enabled: payload.is_enabled !== undefined ? payload.is_enabled : existing.is_enabled,
  };

  await validatePackageConfiguration(merged);

  const updated = await serverPackageModel.updateById(id, merged);

  await auditLogModel.createAuditLog({
    userId: adminUser.id,
    action: 'SERVER_PACKAGE_UPDATED',
    resourceType: 'server_package',
    resourceId: id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    status: 'success',
    details: { name: updated.name, provider_key: updated.provider_key, price: updated.price },
  });

  return updated;
}

/**
 * Enable or disable a package (Admin only).
 * @param {Object} adminUser
 * @param {string} id
 * @param {boolean} isEnabled
 * @param {Object} reqMeta
 * @returns {Promise<Object>}
 */
async function setPackageStatus(adminUser, id, isEnabled, reqMeta = {}) {
  const existing = await serverPackageModel.findById(id);
  if (!existing) {
    throw new NotFoundError('Server package not found', {}, 'PACKAGE_NOT_FOUND');
  }

  const updated = await serverPackageModel.setEnabled(id, isEnabled);

  await auditLogModel.createAuditLog({
    userId: adminUser.id,
    action: 'SERVER_PACKAGE_STATUS_CHANGED',
    resourceType: 'server_package',
    resourceId: id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    status: 'success',
    details: { is_enabled: isEnabled },
  });

  return updated;
}

/**
 * Safely delete a package only if no existing servers or orders depend on it (Admin only).
 * @param {Object} adminUser
 * @param {string} id
 * @param {Object} reqMeta
 * @returns {Promise<{ deleted: boolean, id: string }>}
 */
async function deletePackage(adminUser, id, reqMeta = {}) {
  const existing = await serverPackageModel.findById(id);
  if (!existing) {
    throw new NotFoundError('Server package not found', {}, 'PACKAGE_NOT_FOUND');
  }

  const deps = await serverPackageModel.countDependencies(id);
  if (deps.total > 0) {
    throw new ConflictError(
      `Cannot delete package while ${deps.servers} server(s) and ${deps.orders} order(s) depend on it`,
      { dependencies: deps },
      'PACKAGE_IN_USE'
    );
  }

  await serverPackageModel.deleteById(id);

  await auditLogModel.createAuditLog({
    userId: adminUser.id,
    action: 'SERVER_PACKAGE_DELETED',
    resourceType: 'server_package',
    resourceId: id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    status: 'success',
    details: { name: existing.name },
  });

  return { deleted: true, id };
}

/**
 * List currently enabled and available packages for authenticated customers.
 * @returns {Promise<Array<Object>>}
 */
async function listAvailablePackagesForCustomer() {
  const packages = await serverPackageModel.findAllEnabled();
  const checked = await Promise.all(
    packages.map(async (pkg) => ({
      pkg,
      availability: await checkPackageAvailability(pkg),
    }))
  );

  return checked
    .filter((entry) => entry.availability.available)
    .map((entry) => toCustomerPackageView(entry.pkg, entry.availability));
}

/**
 * Retrieve a single enabled and available package for an authenticated customer.
 * @param {string} id
 * @returns {Promise<Object>}
 */
async function getAvailablePackageForCustomer(id) {
  const pkg = await serverPackageModel.findById(id);
  if (!pkg || !pkg.is_enabled) {
    throw new NotFoundError('Server package not found', {}, 'PACKAGE_NOT_FOUND');
  }

  const availability = await checkPackageAvailability(pkg);
  if (!availability.available) {
    throw new NotFoundError('Server package is currently unavailable', {}, 'PACKAGE_UNAVAILABLE');
  }

  return toCustomerPackageView(pkg, availability);
}

module.exports = {
  validatePackageConfiguration,
  checkPackageAvailability,
  createPackage,
  listAllPackagesAdmin,
  getPackageAdmin,
  updatePackage,
  setPackageStatus,
  deletePackage,
  listAvailablePackagesForCustomer,
  getAvailablePackageForCustomer,
};

