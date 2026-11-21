const { query } = require('../config/db');
const { redactSensitive } = require('../utils/logger');

async function createOrder({
  userId,
  botId = null,
  packageId = null,
  providerKey = null,
  connectionId = null,
  providerAssignmentSnapshot = null,
  serviceType,
  bwmOrderRef = null,
  status = 'pending',
  days = null,
  chargedXd = null,
  balanceAfter = null,
  requestPayload = {},
  bwmResponse = {},
  errorMessage = null,
}) {
  const result = await query(
    `INSERT INTO orders (
       user_id, bot_id, package_id, provider_key, connection_id, provider_assignment_snapshot,
       service_type, bwm_order_ref, status, days,
       charged_xd, balance_after, request_payload, bwm_response, error_message
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      userId,
      botId,
      packageId,
      providerKey,
      connectionId,
      providerAssignmentSnapshot ? JSON.stringify(providerAssignmentSnapshot) : null,
      serviceType,
      bwmOrderRef,
      status,
      days,
      chargedXd,
      balanceAfter,
      JSON.stringify(redactSensitive(requestPayload || {})),
      JSON.stringify(redactSensitive(bwmResponse || {})),
      errorMessage,
    ]
  );
  return result.rows[0];
}

/**
 * Retrieve a single order by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function findById(id) {
  const result = await query('SELECT * FROM orders WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function updateOrder(id, {
  botId = null,
  bwmOrderRef = null,
  status,
  chargedXd = null,
  balanceAfter = null,
  bwmResponse = null,
  errorMessage = null,
}) {
  const result = await query(
    `UPDATE orders
     SET bot_id = COALESCE($2, bot_id),
         bwm_order_ref = COALESCE($3, bwm_order_ref),
         status = COALESCE($4, status),
         charged_xd = COALESCE($5, charged_xd),
         balance_after = COALESCE($6, balance_after),
         bwm_response = COALESCE($7, bwm_response),
         error_message = COALESCE($8, error_message),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      botId,
      bwmOrderRef,
      status,
      chargedXd,
      balanceAfter,
      bwmResponse ? JSON.stringify(redactSensitive(bwmResponse)) : null,
      errorMessage,
    ]
  );
  return result.rows[0] || null;
}

async function findByUserId(userId, { limit = 50, offset = 0 } = {}) {
  const result = await query(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [userId, limit, offset]
  );
  return result.rows;
}

async function findAll({ status = null, limit = 100, offset = 0 } = {}) {
  if (status) {
    const result = await query(
      'SELECT * FROM orders WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [status, limit, offset]
    );
    return result.rows;
  }
  const result = await query(
    'SELECT * FROM orders ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return result.rows;
}

module.exports = {
  createOrder,
  findById,
  updateOrder,
  findByUserId,
  findAll,
};

