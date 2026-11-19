const { query } = require('../config/db');

async function createBot({
  userId,
  bwmBotId,
  appName,
  customName = null,
  templateId = null,
  status = 'active',
  deployedAt = null,
  expiresAt = null,
  bwmMetadata = {},
}) {
  const result = await query(
    `INSERT INTO bots (
       user_id, bwm_bot_id, app_name, custom_name, template_id,
       status, deployed_at, expires_at, last_synced_at, bwm_metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), $8, NOW(), $9)
     RETURNING *`,
    [
      userId,
      String(bwmBotId),
      appName,
      customName,
      templateId,
      status,
      deployedAt,
      expiresAt,
      JSON.stringify(bwmMetadata || {}),
    ]
  );
  return result.rows[0];
}

async function findById(id) {
  const result = await query(
    'SELECT * FROM bots WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  return result.rows[0] || null;
}

async function findByBwmBotId(bwmBotId) {
  const result = await query(
    'SELECT * FROM bots WHERE bwm_bot_id = $1 AND deleted_at IS NULL',
    [String(bwmBotId)]
  );
  return result.rows[0] || null;
}

async function findByIdOrBwmId(identifier) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(identifier)
  );
  if (isUuid) {
    const result = await query(
      'SELECT * FROM bots WHERE (id = $1 OR bwm_bot_id = $2) AND deleted_at IS NULL LIMIT 1',
      [identifier, String(identifier)]
    );
    return result.rows[0] || null;
  }
  return findByBwmBotId(identifier);
}

async function findByUserId(userId) {
  const result = await query(
    'SELECT * FROM bots WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
}

async function findAllActive() {
  const result = await query(
    'SELECT * FROM bots WHERE deleted_at IS NULL ORDER BY created_at DESC'
  );
  return result.rows;
}

async function updateBotById(id, { status, expiresAt, customName, bwmMetadata }) {
  const result = await query(
    `UPDATE bots
     SET status = COALESCE($2, status),
         expires_at = COALESCE($3, expires_at),
         custom_name = COALESCE($4, custom_name),
         bwm_metadata = COALESCE($5, bwm_metadata),
         last_synced_at = NOW(),
         updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [
      id,
      status ?? null,
      expiresAt ?? null,
      customName ?? null,
      bwmMetadata ? JSON.stringify(bwmMetadata) : null,
    ]
  );
  return result.rows[0] || null;
}

async function softDeleteBot(id) {
  const result = await query(
    `UPDATE bots
     SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

module.exports = {
  createBot,
  findById,
  findByBwmBotId,
  findByIdOrBwmId,
  findByUserId,
  findAllActive,
  updateBotById,
  softDeleteBot,
};

