const { query } = require('../config/db');

/**
 * Create a new server package for either 'pterodactyl' or 'bwm-xmd'.
 * @param {Object} pkg
 * @returns {Promise<Object>}
 */
async function createPackage(pkg) {
  const result = await query(
    `INSERT INTO server_packages (
       name, description, price, currency, provider_key, connection_id, bwm_plan_id,
       memory_mb, disk_mb, cpu_percent, swap_mb, io_weight,
       database_limit, backup_limit, allocation_limit,
       nest_id, egg_id, location_id, node_id, allocation_id,
       egg_environment, is_enabled, created_by
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12,
       $13, $14, $15,
       $16, $17, $18, $19, $20,
       $21, $22, $23
     )
     RETURNING *`,
    [
      pkg.name,
      pkg.description ?? null,
      pkg.price,
      pkg.currency || 'XD',
      pkg.provider_key,
      pkg.connection_id ?? null,
      pkg.bwm_plan_id ?? null,
      pkg.memory_mb ?? 512,
      pkg.disk_mb ?? 1024,
      pkg.cpu_percent ?? 100,
      pkg.swap_mb ?? 0,
      pkg.io_weight ?? 500,
      pkg.database_limit ?? 0,
      pkg.backup_limit ?? 0,
      pkg.allocation_limit ?? 1,
      pkg.nest_id ?? null,
      pkg.egg_id ?? null,
      pkg.location_id ?? null,
      pkg.node_id ?? null,
      pkg.allocation_id ?? null,
      JSON.stringify(pkg.egg_environment || {}),
      pkg.is_enabled ?? true,
      pkg.created_by ?? null,
    ]
  );
  return result.rows[0];
}

/**
 * Retrieve all packages (admin view).
 * @returns {Promise<Array<Object>>}
 */
async function findAll() {
  const result = await query('SELECT * FROM server_packages ORDER BY created_at DESC');
  return result.rows;
}

/**
 * Retrieve all enabled packages (for customer availability filtering).
 * @returns {Promise<Array<Object>>}
 */
async function findAllEnabled() {
  const result = await query(
    'SELECT * FROM server_packages WHERE is_enabled = TRUE ORDER BY price ASC, created_at DESC'
  );
  return result.rows;
}

/**
 * Find a package by its UUID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function findById(id) {
  const result = await query('SELECT * FROM server_packages WHERE id = $1', [id]);
  return result.rows[0] || null;
}

/**
 * Update an existing package by ID.
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<Object|null>}
 */
async function updateById(id, updates) {
  const result = await query(
    `UPDATE server_packages
     SET name = $2,
         description = $3,
         price = $4,
         currency = $5,
         provider_key = $6,
         connection_id = $7,
         bwm_plan_id = $8,
         memory_mb = $9,
         disk_mb = $10,
         cpu_percent = $11,
         swap_mb = $12,
         io_weight = $13,
         database_limit = $14,
         backup_limit = $15,
         allocation_limit = $16,
         nest_id = $17,
         egg_id = $18,
         location_id = $19,
         node_id = $20,
         allocation_id = $21,
         egg_environment = $22,
         is_enabled = $23,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      updates.name,
      updates.description ?? null,
      updates.price,
      updates.currency,
      updates.provider_key,
      updates.connection_id ?? null,
      updates.bwm_plan_id ?? null,
      updates.memory_mb,
      updates.disk_mb,
      updates.cpu_percent,
      updates.swap_mb,
      updates.io_weight,
      updates.database_limit,
      updates.backup_limit,
      updates.allocation_limit,
      updates.nest_id ?? null,
      updates.egg_id ?? null,
      updates.location_id ?? null,
      updates.node_id ?? null,
      updates.allocation_id ?? null,
      JSON.stringify(updates.egg_environment || {}),
      updates.is_enabled,
    ]
  );
  return result.rows[0] || null;
}

/**
 * Toggle package enabled/disabled status.
 * @param {string} id
 * @param {boolean} isEnabled
 * @returns {Promise<Object|null>}
 */
async function setEnabled(id, isEnabled) {
  const result = await query(
    `UPDATE server_packages
     SET is_enabled = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, isEnabled]
  );
  return result.rows[0] || null;
}

/**
 * Count dependent servers and orders referencing this package before deletion.
 * @param {string} id
 * @returns {Promise<{ servers: number, orders: number, total: number }>}
 */
async function countDependencies(id) {
  const [srvRes, ordRes] = await Promise.all([
    query('SELECT COUNT(*)::int AS count FROM panel_servers WHERE package_id = $1', [id]),
    query('SELECT COUNT(*)::int AS count FROM orders WHERE package_id = $1', [id]),
  ]);
  const servers = srvRes.rows[0]?.count || 0;
  const orders = ordRes.rows[0]?.count || 0;
  return { servers, orders, total: servers + orders };
}

/**
 * Permanently delete a package that has no dependent servers or orders.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function deleteById(id) {
  const result = await query(
    'DELETE FROM server_packages WHERE id = $1 RETURNING id, name',
    [id]
  );
  return result.rows[0] || null;
}

module.exports = {
  createPackage,
  findAll,
  findAllEnabled,
  findById,
  updateById,
  setEnabled,
  countDependencies,
  deleteById,
};

