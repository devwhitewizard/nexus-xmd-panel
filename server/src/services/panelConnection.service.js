const panelConnectionModel = require('../models/panelConnection.model');
const auditLogModel = require('../models/auditLog.model');
const { providerManager } = require('../providers/providerManager');
const { encryptSecret, decryptSecret } = require('../utils/crypto');
const { validatePanelUrl } = require('../utils/ssrfGuard');
const { ConflictError, NotFoundError } = require('../utils/errors');

function listProviders() {
  return providerManager.listProviders();
}

async function createConnection(adminUser, payload, reqMeta = {}) {
  const { normalizedUrl } = await validatePanelUrl(payload.panel_url);
  const apiKeyEncrypted = encryptSecret(payload.api_key);

  const connection = await panelConnectionModel.createConnection({
    label: payload.label,
    panelUrl: normalizedUrl,
    apiKeyEncrypted,
    description: payload.description ?? null,
    isEnabled: payload.is_enabled ?? true,
    defaultConfig: payload.default_config || {},
    createdBy: adminUser.id,
  });

  await auditLogModel.createAuditLog({
    userId: adminUser.id,
    action: 'PANEL_CONNECTION_CREATED',
    resourceType: 'panel_connection',
    resourceId: connection.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    status: 'success',
    details: { label: connection.label, panel_url: connection.panel_url },
  });

  return connection;
}

async function listConnections() {
  return panelConnectionModel.findAll();
}

async function getConnection(id) {
  const connection = await panelConnectionModel.findById(id);
  if (!connection) {
    throw new NotFoundError('Panel connection not found', {}, 'CONNECTION_NOT_FOUND');
  }
  return connection;
}

async function updateConnection(adminUser, id, payload, reqMeta = {}) {
  const existing = await panelConnectionModel.findById(id);
  if (!existing) {
    throw new NotFoundError('Panel connection not found', {}, 'CONNECTION_NOT_FOUND');
  }

  let normalizedUrl = null;
  if (payload.panel_url !== undefined) {
    const validated = await validatePanelUrl(payload.panel_url);
    normalizedUrl = validated.normalizedUrl;
  }

  const apiKeyEncrypted =
    payload.api_key !== undefined ? encryptSecret(payload.api_key) : null;

  const updated = await panelConnectionModel.updateById(id, {
    label: payload.label ?? null,
    panelUrl: normalizedUrl,
    apiKeyEncrypted,
    description: payload.description,
    isEnabled: payload.is_enabled ?? null,
    defaultConfig: payload.default_config ?? null,
  });

  await auditLogModel.createAuditLog({
    userId: adminUser.id,
    action: 'PANEL_CONNECTION_UPDATED',
    resourceType: 'panel_connection',
    resourceId: id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    status: 'success',
    details: {
      rotated_api_key: Boolean(apiKeyEncrypted),
      updated_url: Boolean(normalizedUrl),
    },
  });

  return updated;
}

async function setConnectionStatus(adminUser, id, isEnabled, reqMeta = {}) {
  const existing = await panelConnectionModel.findById(id);
  if (!existing) {
    throw new NotFoundError('Panel connection not found', {}, 'CONNECTION_NOT_FOUND');
  }

  const updated = await panelConnectionModel.setEnabled(id, isEnabled);

  await auditLogModel.createAuditLog({
    userId: adminUser.id,
    action: 'PANEL_CONNECTION_STATUS_CHANGED',
    resourceType: 'panel_connection',
    resourceId: id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    status: 'success',
    details: { is_enabled: isEnabled },
  });

  return updated;
}

async function deleteConnection(adminUser, id, reqMeta = {}) {
  const existing = await panelConnectionModel.findById(id);
  if (!existing) {
    throw new NotFoundError('Panel connection not found', {}, 'CONNECTION_NOT_FOUND');
  }

  const dependentCount = await panelConnectionModel.countDependentServers(id);
  if (dependentCount > 0) {
    throw new ConflictError(
      `Cannot delete panel connection while ${dependentCount} server(s) depend on it`,
      { dependent_servers: dependentCount },
      'CONNECTION_IN_USE'
    );
  }

  await panelConnectionModel.deleteById(id);

  await auditLogModel.createAuditLog({
    userId: adminUser.id,
    action: 'PANEL_CONNECTION_DELETED',
    resourceType: 'panel_connection',
    resourceId: id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    status: 'success',
    details: { label: existing.label },
  });

  return { deleted: true, id };
}

async function testConnection(adminUser, id, reqMeta = {}) {
  const record = await panelConnectionModel.findEncryptedById(id);
  if (!record) {
    throw new NotFoundError('Panel connection not found', {}, 'CONNECTION_NOT_FOUND');
  }

  const apiKey = decryptSecret(record.api_key_encrypted);
  const pteroProvider = providerManager.getProvider('pterodactyl');

  try {
    const testResult = await pteroProvider.testConnection({
      panelUrl: record.panel_url,
      apiKey,
    });

    const updated = await panelConnectionModel.updateTestStatus(id, {
      connectionStatus: 'connected',
      lastError: null,
    });

    await auditLogModel.createAuditLog({
      userId: adminUser.id,
      action: 'PANEL_CONNECTION_TESTED',
      resourceType: 'panel_connection',
      resourceId: id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      status: 'success',
      details: { node_count: testResult.node_count },
    });

    return { connection: updated, test_result: testResult };
  } catch (err) {
    await panelConnectionModel.updateTestStatus(id, {
      connectionStatus: 'failed',
      lastError: err.message,
    });

    await auditLogModel.createAuditLog({
      userId: adminUser.id,
      action: 'PANEL_CONNECTION_TESTED',
      resourceType: 'panel_connection',
      resourceId: id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      status: 'failed',
      details: { code: err.code, message: err.message },
    });

    throw err;
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
};

