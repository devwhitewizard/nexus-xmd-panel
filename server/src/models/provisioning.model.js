const { query, withTransaction } = require('../config/db');
const { redactSensitive } = require('../utils/logger');

/**
 * Retrieve a provisioning log by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function findById(id) {
  const result = await query('SELECT * FROM provisioning_logs WHERE id = $1', [id]);
  return result.rows[0] || null;
}

/**
 * Retrieve the latest provisioning log for an order.
 * @param {string} orderId
 * @returns {Promise<Object|null>}
 */
async function findLatestByOrderId(orderId) {
  const result = await query(
    'SELECT * FROM provisioning_logs WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
    [orderId]
  );
  return result.rows[0] || null;
}

/**
 * List all provisioning logs (admin view).
 * @param {{ status?: string, limit?: number, offset?: number }} options
 * @returns {Promise<Array<Object>>}
 */
async function findAll({ status = null, limit = 100, offset = 0 } = {}) {
  if (status) {
    const result = await query(
      'SELECT * FROM provisioning_logs WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [status, limit, offset]
    );
    return result.rows;
  }
  const result = await query(
    'SELECT * FROM provisioning_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return result.rows;
}

/**
 * Atomically acquire or create a provisioning log for an order using a PostgreSQL
 * transaction + row-level lock (`FOR UPDATE`) and the DB partial unique index on active orders.
 * Prevents concurrent or duplicate server creation across multiple app instances.
 *
 * @param {Object} params
 * @returns {Promise<{ created: boolean, log: Object }>}
 */
async function acquireProvisioningLock({
  orderId,
  userId,
  providerKey,
  connectionId = null,
  idempotencyKey,
  requestMetadata = {},
  attemptCount = 1,
}) {
  return withTransaction(async (client) => {
    // Lock existing order row to serialize concurrent provisioning requests for the same order
    await client.query('SELECT id FROM orders WHERE id = $1 FOR UPDATE', [orderId]);

    const existingRes = await client.query(
      'SELECT * FROM provisioning_logs WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
      [orderId]
    );
    const existing = existingRes.rows[0] || null;

    if (existing && ['pending', 'processing', 'successful', 'uncertain'].includes(existing.status)) {
      return { created: false, log: existing };
    }

    const insertRes = await client.query(
      `INSERT INTO provisioning_logs (
         order_id, user_id, provider_key, connection_id, idempotency_key,
         status, request_metadata, attempt_count, started_at
       )
       VALUES ($1, $2, $3, $4, $5, 'processing', $6, $7, NOW())
       RETURNING *`,
      [
        orderId,
        userId,
        providerKey,
        connectionId,
        idempotencyKey,
        JSON.stringify(redactSensitive(requestMetadata || {})),
        attemptCount,
      ]
    );

    return { created: true, log: insertRes.rows[0] };
  });
}

/**
 * Transition a provisioning log to `successful` and link the persisted `server_id`.
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object|null>}
 */
async function markSuccessful(id, {
  serverId,
  externalServerId,
  providerRequestId = null,
  responseMetadata = {},
}) {
  const result = await query(
    `UPDATE provisioning_logs
     SET status = 'successful',
         server_id = $2,
         external_server_id = $3,
         provider_request_id = COALESCE($4, provider_request_id),
         response_metadata = $5,
         error_code = NULL,
         error_message = NULL,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      serverId,
      externalServerId ? String(externalServerId) : null,
      providerRequestId,
      JSON.stringify(redactSensitive(responseMetadata || {})),
    ]
  );
  return result.rows[0] || null;
}

/**
 * Transition a provisioning log to `failed` (confirmed non-creation).
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object|null>}
 */
async function markFailed(id, { errorCode = null, errorMessage = null, responseMetadata = {} }) {
  const result = await query(
    `UPDATE provisioning_logs
     SET status = 'failed',
         error_code = $2,
         error_message = $3,
         response_metadata = $4,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      errorCode,
      errorMessage,
      JSON.stringify(redactSensitive(responseMetadata || {})),
    ]
  );
  return result.rows[0] || null;
}

/**
 * Transition a provisioning log to `uncertain` (timeout, 5xx, or DB persistence failure after external create).
 * Preserves externalServerId if known for reconciliation.
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object|null>}
 */
async function markUncertain(id, {
  externalServerId = null,
  errorCode = null,
  errorMessage = null,
  responseMetadata = {},
}) {
  const result = await query(
    `UPDATE provisioning_logs
     SET status = 'uncertain',
         external_server_id = COALESCE($2, external_server_id),
         error_code = $3,
         error_message = $4,
         response_metadata = $5,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      externalServerId ? String(externalServerId) : null,
      errorCode,
      errorMessage,
      JSON.stringify(redactSensitive(responseMetadata || {})),
    ]
  );
  return result.rows[0] || null;
}

module.exports = {
  findById,
  findLatestByOrderId,
  findAll,
  acquireProvisioningLock,
  markSuccessful,
  markFailed,
  markUncertain,
};

