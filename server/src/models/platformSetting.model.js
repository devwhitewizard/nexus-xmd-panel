const { query } = require('../config/db');

async function getSetting(key) {
  const result = await query('SELECT * FROM platform_settings WHERE key = $1', [key]);
  return result.rows[0] || null;
}

async function setSetting(key, value, description = null, updatedBy = null) {
  const result = await query(
    `INSERT INTO platform_settings (key, value, description, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (key) DO UPDATE
     SET value = EXCLUDED.value,
         description = COALESCE(EXCLUDED.description, platform_settings.description),
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
     RETURNING *`,
    [key, JSON.stringify(value), description, updatedBy]
  );
  return result.rows[0];
}

async function listSettings() {
  const result = await query('SELECT * FROM platform_settings ORDER BY key ASC');
  return result.rows;
}

module.exports = {
  getSetting,
  setSetting,
  listSettings,
};

