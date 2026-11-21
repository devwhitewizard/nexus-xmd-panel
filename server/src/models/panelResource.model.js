const { query } = require('../config/db');

async function findByConnectionId(connectionId) {
  const result = await query(
    'SELECT * FROM panel_resources WHERE connection_id = $1',
    [connectionId]
  );
  return result.rows[0] || null;
}

async function upsertDiscoverySuccess(
  connectionId,
  { nests = [], eggs = [], locations = [], nodes = [], allocations = [] }
) {
  const result = await query(
    `INSERT INTO panel_resources (
       connection_id, discovered_nests, discovered_eggs, discovered_locations,
       discovered_nodes, discovered_allocations, discovery_status,
       last_synced_at, last_attempted_at, last_error, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'synced', NOW(), NOW(), NULL, NOW())
     ON CONFLICT (connection_id) DO UPDATE
     SET discovered_nests = EXCLUDED.discovered_nests,
         discovered_eggs = EXCLUDED.discovered_eggs,
         discovered_locations = EXCLUDED.discovered_locations,
         discovered_nodes = EXCLUDED.discovered_nodes,
         discovered_allocations = EXCLUDED.discovered_allocations,
         discovery_status = 'synced',
         last_synced_at = NOW(),
         last_attempted_at = NOW(),
         last_error = NULL,
         updated_at = NOW()
     RETURNING *`,
    [
      connectionId,
      JSON.stringify(nests),
      JSON.stringify(eggs),
      JSON.stringify(locations),
      JSON.stringify(nodes),
      JSON.stringify(allocations),
    ]
  );
  return result.rows[0];
}

/**
 * Record a failed discovery attempt while preserving any previously discovered resources.
 */
async function recordDiscoveryFailure(connectionId, errorMessage) {
  const result = await query(
    `INSERT INTO panel_resources (
       connection_id, discovery_status, last_attempted_at, last_error, updated_at
     )
     VALUES ($1, 'failed', NOW(), $2, NOW())
     ON CONFLICT (connection_id) DO UPDATE
     SET discovery_status = 'failed',
         last_attempted_at = NOW(),
         last_error = EXCLUDED.last_error,
         updated_at = NOW()
     RETURNING *`,
    [connectionId, errorMessage]
  );
  return result.rows[0];
}

async function updateManualOverrides(connectionId, manualOverrides) {
  const result = await query(
    `UPDATE panel_resources
     SET manual_overrides = $2,
         updated_at = NOW()
     WHERE connection_id = $1
     RETURNING *`,
    [connectionId, JSON.stringify(manualOverrides || {})]
  );
  return result.rows[0] || null;
}

module.exports = {
  findByConnectionId,
  upsertDiscoverySuccess,
  recordDiscoveryFailure,
  updateManualOverrides,
};

