const { query } = require('../config/db');
const { redactSensitive } = require('../utils/logger');

async function createAuditLog({
  userId = null,
  action,
  resourceType,
  resourceId = null,
  ipAddress = null,
  userAgent = null,
  status = 'success',
  details = {},
}) {
  const result = await query(
    `INSERT INTO audit_logs (
       user_id, action, resource_type, resource_id, ip_address, user_agent, status, details
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      userId,
      action,
      resourceType,
      resourceId ? String(resourceId) : null,
      ipAddress,
      userAgent,
      status,
      JSON.stringify(redactSensitive(details || {})),
    ]
  );
  return result.rows[0];
}

async function listAuditLogs({ limit = 100, offset = 0 } = {}) {
  const result = await query(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return result.rows;
}

module.exports = {
  createAuditLog,
  listAuditLogs,
};

