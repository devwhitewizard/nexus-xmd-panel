const { PanelProvider } = require('../interfaces/panelProvider.interface');
const { AppError, BadRequestError } = require('../../utils/errors');
const pterodactylClient = require('./pterodactyl.client');
const pterodactylResources = require('./pterodactyl.resources');

/**
 * Validate and merge package egg_environment with the egg's discovered variables.
 * Applies discovered defaults when not overridden and rejects missing required variables.
 * @param {Object} egg
 * @param {Object} packageEnv
 * @returns {Object}
 */
function buildValidatedEggEnvironment(egg, packageEnv = {}) {
  const merged = {};
  const discoveredVars = Array.isArray(egg?.variables) ? egg.variables : [];

  for (const v of discoveredVars) {
    if (!v.env_variable) continue;
    const supplied = Object.prototype.hasOwnProperty.call(packageEnv, v.env_variable)
      ? packageEnv[v.env_variable]
      : v.default_value;

    const isRequired = typeof v.rules === 'string' && v.rules.split('|').includes('required');
    if (isRequired && (supplied === undefined || supplied === null || String(supplied).trim() === '')) {
      throw new BadRequestError(
        `Missing required egg environment variable "${v.env_variable}"`,
        { env_variable: v.env_variable },
        'MISSING_EGG_ENVIRONMENT_VAR'
      );
    }

    if (supplied !== undefined && supplied !== null) {
      merged[v.env_variable] = String(supplied);
    }
  }

  for (const [key, val] of Object.entries(packageEnv || {})) {
    if (!Object.prototype.hasOwnProperty.call(merged, key) && val !== undefined && val !== null) {
      merged[key] = String(val);
    }
  }

  return merged;
}

class PterodactylProvider extends PanelProvider {
  constructor() {
    super({
      key: 'pterodactyl',
      name: 'Pterodactyl',
      requiresConnectionConfig: true,
      capabilities: {
        testConnection: true,
        discoverResources: true,
        provisionServer: true,
        getServerDetails: true,
        setPowerState: true,
        getServerResources: true,
      },
    });
  }

  pendingImplementation(operation) {
    throw new AppError(
      `Pterodactyl "${operation}" will be implemented in the upcoming provider phase`,
      501,
      'PTERODACTYL_PHASE_PENDING',
      { provider: this.key, operation }
    );
  }

  async testConnection({ panelUrl, apiKey } = {}) {
    this.assertSupported('testConnection');
    return pterodactylClient.testConnection({ panelUrl, apiKey });
  }

  async discoverResources({ panelUrl, apiKey } = {}) {
    this.assertSupported('discoverResources');
    return pterodactylResources.discoverAll({ panelUrl, apiKey });
  }

  /**
   * Provision a new server on a Pterodactyl installation using trusted package
   * and discovered resource configuration.
   */
  async provisionServer({
    panelUrl,
    apiKey,
    idempotencyKey,
    serverName,
    customer,
    snapshot,
    discoveredResources,
  }) {
    this.assertSupported('provisionServer');

    const pteroRes = snapshot?.pterodactyl_resources || {};
    const limits = snapshot?.resource_limits || {};
    const eggs = discoveredResources?.discovered_eggs || [];
    const egg = eggs.find((e) => e.id === pteroRes.egg_id);

    if (!egg || egg.nest_id !== pteroRes.nest_id) {
      throw new BadRequestError(
        'Selected egg is missing or does not belong to the configured nest',
        {},
        'EGG_NEST_MISMATCH'
      );
    }

    if (!egg.docker_image || !egg.startup) {
      throw new BadRequestError(
        'Selected Pterodactyl egg is missing docker_image or startup command; refresh resource discovery',
        {},
        'INCOMPLETE_EGG_METADATA'
      );
    }

    const environment = buildValidatedEggEnvironment(egg, pteroRes.egg_environment || {});
    const pteroUser = await pterodactylClient.findOrCreateUser({
      panelUrl,
      apiKey,
      email: customer.email,
      username: customer.username,
    });

    const payload = {
      name: serverName,
      external_id: idempotencyKey,
      user: pteroUser.id,
      egg: egg.id,
      docker_image: egg.docker_image,
      startup: egg.startup,
      environment,
      limits: {
        memory: limits.memory_mb,
        swap: limits.swap_mb ?? 0,
        disk: limits.disk_mb,
        io: limits.io_weight ?? 500,
        cpu: limits.cpu_percent,
      },
      feature_limits: {
        databases: limits.database_limit ?? 0,
        allocations: limits.allocation_limit ?? 1,
        backups: limits.backup_limit ?? 0,
      },
    };

    if (pteroRes.allocation_id) {
      payload.allocation = { default: pteroRes.allocation_id };
    } else if (pteroRes.location_id) {
      payload.deploy = {
        locations: [pteroRes.location_id],
        dedicated_ip: false,
        port_range: [],
      };
    } else {
      throw new BadRequestError(
        'Pterodactyl provisioning requires either allocation_id or location_id',
        {},
        'MISSING_ALLOCATION_OR_LOCATION'
      );
    }

    const serverAttr = await pterodactylClient.createServer({
      panelUrl,
      apiKey,
      payload,
    });

    return {
      external_server_id: String(serverAttr.id),
      identifier: serverAttr.identifier || null,
      uuid: serverAttr.uuid || null,
      name: serverAttr.name || serverName,
      panel_url: panelUrl,
      status: serverAttr.status || 'installing',
      ptero_user_id: pteroUser.id,
    };
  }

  async findServerByExternalId({ panelUrl, apiKey, externalId }) {
    return pterodactylClient.findServerByExternalId({ panelUrl, apiKey, externalId });
  }

  async getServerDetails({ panelUrl, apiKey, externalServerId } = {}) {
    this.assertSupported('getServerDetails');
    const attr = await pterodactylClient.getServerDetails({
      panelUrl,
      apiKey,
      externalServerId,
    });
    return {
      external_server_id: String(attr.id),
      identifier: attr.identifier || null,
      uuid: attr.uuid || null,
      name: attr.name || null,
      suspended: Boolean(attr.suspended),
      limits: attr.limits || null,
      feature_limits: attr.feature_limits || null,
    };
  }

  async setPowerState({ panelUrl, apiKey, identifier, signal } = {}) {
    this.assertSupported('setPowerState');
    return pterodactylClient.setPowerState({
      panelUrl,
      apiKey,
      identifier,
      signal,
    });
  }

  async getServerResources({ panelUrl, apiKey, identifier } = {}) {
    this.assertSupported('getServerResources');
    return pterodactylClient.getServerResources({
      panelUrl,
      apiKey,
      identifier,
    });
  }
}

module.exports = {
  PterodactylProvider,
  buildValidatedEggEnvironment,
};
