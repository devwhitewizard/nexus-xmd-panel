const { query } = require('../config/db');
const { redactSensitive } = require('../utils/logger');

async function createPanelServer({
  userId,
  orderId = null,
  bwmPanelId = null,
  planId,
  planName = null,
  panelUrl = null,
  username,
  status = 'active',
  bwmMetadata = {},
}) {
  const result = await query(
    `INSERT INTO panel_servers (
       user_id, order_id, bwm_panel_id, plan_id, plan_name,
       panel_url, username, status, bwm_metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      userId,
      orderId,
      bwmPanelId ? String(bwmPanelId) : null,
      planId,
      planName,
      panelUrl,
      username,
      status,
      JSON.stringify(redactSensitive(bwmMetadata || {})),
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

module.exports = {
  createPanelServer,
  findByUserId,
  findAll,
};

