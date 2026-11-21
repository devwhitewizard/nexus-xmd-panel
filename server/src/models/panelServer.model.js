const { query } = require('../config/db');
const { redactSensitive } = require('../utils/logger');

/**
 * Create a provisioned server record in `panel_servers` (Pterodactyl or BWM XMD).
 * Preserves original provider, connection, package, and external server association.
 * @param {Object} data
 * @returns {Promise<Object>}
 */
async function createPanelServer({
  userId,
  orderId = null,
  packageId = null,
  providerKey = 'bwm-xmd',
  connectionId = null,
  bwmPanelId = null,
  externalServerId = null,
  planId,
  planName = null,
  serverName = null,
  panelUrl = null,
  username,
  status = 'active',
  bwmMetadata = {},
  providerMetadata = {},
}) {
  const result = await query(
    `INSERT INTO panel_servers (
       user_id, order_id, package_id, provider_key, connection_id,
       bwm_panel_id, external_server_id, plan_id, plan_name, server_name,
       panel_url, username, status, bwm_metadata, provider_metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      userId,
      orderId,
      packageId,
      providerKey,
      connectionId,
      bwmPanelId ? String(bwmPanelId) : null,
      externalServerId ? String(externalServerId) : null,
      planId,
      planName,
      serverName,
      panelUrl,
      username,
      status,
      JSON.stringify(redactSensitive(bwmMetadata || {})),
      JSON.stringify(redactSensitive(providerMetadata || {})),
    ]
  );
  return result.rows[0];
}

async function findByUserId(userId) {
  const result = await query(
    'SELECT * FROM panel_servers WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
}

async function findAll() {
  const result = await query('SELECT * FROM panel_servers ORDER BY created_at DESC');
  return result.rows;
}

async function findByOrderId(orderId) {
  const result = await query(
    'SELECT * FROM panel_servers WHERE order_id = $1 LIMIT 1',
    [orderId]
  );
  return result.rows[0] || null;
}

async function findById(id) {
  const result = await query('SELECT * FROM panel_servers WHERE id = $1', [id]);
  return result.rows[0] || null;
}

/**
 * Retrieve paginated and filtered server records directly from PostgreSQL.
 * Enforces customer isolation when `isAdmin` is false.
 *
 * @param {Object} params
 * @returns {Promise<{ servers: Array<Object>, total: number }>}
 */
async function findPaginated({
  userId,
  isAdmin = false,
  status = null,
  providerKey = null,
  limit = 20,
  offset = 0,
}) {
  const conditions = [];
  const values = [];

  if (!isAdmin) {
    values.push(userId);
    conditions.push(`user_id = $${values.length}`);
  }
  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  if (providerKey) {
    values.push(providerKey);
    conditions.push(`provider_key = $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM panel_servers ${whereClause}`,
    values
  );

  const listValues = [...values, limit, offset];
  const rowsResult = await query(
    `SELECT * FROM panel_servers ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
    listValues
  );

  return {
    servers: rowsResult.rows,
    total: countResult.rows[0]?.total || 0,
  };
}

module.exports = {
  createPanelServer,
  findByUserId,
  findAll,
  findByOrderId,
  findById,
  findPaginated,
};
