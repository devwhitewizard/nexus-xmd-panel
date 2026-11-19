const { query } = require('../config/db');
const { redactSensitive } = require('../utils/logger');

async function createTransaction({
  userId = null,
  orderId = null,
  ledgerType = 'bwm_xd',
  direction = 'debit',
  amount = 0,
  currency = 'XD',
  balanceAfter = null,
  bwmReference = null,
  status = 'completed',
  description = '',
  metadata = {},
}) {
  const result = await query(
    `INSERT INTO transactions (
       user_id, order_id, ledger_type, direction, amount, currency,
       balance_after, bwm_reference, status, description, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      userId,
      orderId,
      ledgerType,
      direction,
      amount,
      currency,
      balanceAfter,
      bwmReference,
      status,
      description,
      JSON.stringify(redactSensitive(metadata || {})),
    ]
  );
  return result.rows[0];
}

async function findByUserId(userId, { limit = 50, offset = 0 } = {}) {
  const result = await query(
    'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [userId, limit, offset]
  );
  return result.rows;
}

module.exports = {
  createTransaction,
  findByUserId,
};

