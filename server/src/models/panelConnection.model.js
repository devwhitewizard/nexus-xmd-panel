const { query } = require('../config/db');

const SAFE_CONNECTION_COLUMNS = `
  id, provider_key, label, panel_url, description, is_enabled,
  connection_status, last_tested_at, last_error, default_config,
  created_by, created_at, updated_at
`;

async function createConnection({
  label,
  panelUrl,
  apiKeyEncrypted,
  description = null,
  isEnabled = true,
  defaultConfig = {},
  createdBy = null,
}) {
  const result = await query(
    `INSERT INTO panel_connections (
       provider_key, label, panel_url, api_key_encrypted,
       description, is_enabled, default_config, created_by
     )
     VALUES ('pterodactyl', $1, $2, $3, $4, $5, $6, $7)
     RETURNING ${SAFE_CONNECTION_COLUMNS}`,
    [
      label,
      panelUrl,
      apiKeyEncrypted,
      description,
      isEnabled,
      JSON.stringify(defaultConfig || {}),
      createdBy,
    ]
  );
  return result.rows[0];
}

async function findAll() {
  const result = await query(
    `SELECT ${SAFE_CONNECTION_COLUMNS} FROM panel_connections ORDER BY created_at DESC`
  );
  return result.rows;
}

async function findById(id) {
  const result = await query(
    `SELECT ${SAFE_CONNECTION_COLUMNS} FROM panel_connections WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function findEncryptedById(id) {
  const result = await query(
    `SELECT ${SAFE_CONNECTION_COLUMNS}, api_key_encrypted
     FROM panel_connections
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function updateById(id, {
  label = null,
  panelUrl = null,
  apiKeyEncrypted = null,
  description = undefined,
  isEnabled = null,
  defaultConfig = null,
}) {
  const result = await query(
    `UPDATE panel_connections
     SET label = COALESCE($2, label),
         panel_url = COALESCE($3, panel_url),
         api_key_encrypted = COALESCE($4, api_key_encrypted),
         description = CASE WHEN $5::boolean THEN $6 ELSE description END,
         is_enabled = COALESCE($7, is_enabled),
         default_config = COALESCE($8, default_config),
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${SAFE_CONNECTION_COLUMNS}`,
    [
      id,
      label,
      panelUrl,
      apiKeyEncrypted,
      description !== undefined,
      description ?? null,
      isEnabled,
      defaultConfig !== null ? JSON.stringify(defaultConfig) : null,
    ]
  );
  return result.rows[0] || null;
}

async function setEnabled(id, isEnabled) {
  const result = await query(
    `UPDATE panel_connections
     SET is_enabled = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING ${SAFE_CONNECTION_COLUMNS}`,
    [id, isEnabled]
  );
  return result.rows[0] || null;
}

async function updateTestStatus(id, { connectionStatus, lastError = null }) {
  const result = await query(
    `UPDATE panel_connections
     SET connection_status = $2,
         last_tested_at = NOW(),
         last_error = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${SAFE_CONNECTION_COLUMNS}`,
    [id, connectionStatus, lastError]
  );
  return result.rows[0] || null;
}

async function countDependentServers(id) {
  const result = await query(
    'SELECT COUNT(*)::int AS count FROM panel_servers WHERE connection_id = $1',
    [id]
  );
  return result.rows[0]?.count || 0;
}

async function deleteById(id) {
  const result = await query(
    'DELETE FROM panel_connections WHERE id = $1 RETURNING id, label',
    [id]
  );
  return result.rows[0] || null;
}

module.exports = {
  createConnection,
  findAll,
  findById,
  findEncryptedById,
  updateById,
  setEnabled,
  updateTestStatus,
  countDependentServers,
  deleteById,
};

