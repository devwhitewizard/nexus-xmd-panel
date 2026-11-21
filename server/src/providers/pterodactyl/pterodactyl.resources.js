const pterodactylClient = require('./pterodactyl.client');

function normalizeNest(item) {
  const attr = item?.attributes || {};
  return {
    id: attr.id,
    uuid: attr.uuid || null,
    name: attr.name || `Nest ${attr.id}`,
    description: attr.description || null,
  };
}

function normalizeEgg(item, nestId) {
  const attr = item?.attributes || {};
  const rawVars = attr.relationships?.variables?.data;
  const variables = Array.isArray(rawVars)
    ? rawVars.map((v) => ({
        env_variable: v?.attributes?.env_variable,
        name: v?.attributes?.name,
        default_value: v?.attributes?.default_value ?? '',
        rules: v?.attributes?.rules || '',
        user_editable: Boolean(v?.attributes?.user_editable),
      }))
    : [];

  return {
    id: attr.id,
    nest_id: attr.nest ?? nestId,
    uuid: attr.uuid || null,
    name: attr.name || `Egg ${attr.id}`,
    description: attr.description || null,
    docker_image: attr.docker_image || null,
    startup: attr.startup || null,
    variables,
  };
}

function normalizeLocation(item) {
  const attr = item?.attributes || {};
  return {
    id: attr.id,
    short: attr.short || null,
    long: attr.long || null,
  };
}

function normalizeNode(item) {
  const attr = item?.attributes || {};
  return {
    id: attr.id,
    uuid: attr.uuid || null,
    name: attr.name || `Node ${attr.id}`,
    location_id: attr.location_id ?? null,
    fqdn: attr.fqdn || null,
    memory: attr.memory ?? null,
    memory_overallocate: attr.memory_overallocate ?? 0,
    disk: attr.disk ?? null,
    disk_overallocate: attr.disk_overallocate ?? 0,
    allocated_memory: attr.allocated_resources?.memory ?? null,
    allocated_disk: attr.allocated_resources?.disk ?? null,
    maintenance_mode: Boolean(attr.maintenance_mode),
  };
}

function normalizeAllocation(item, nodeId) {
  const attr = item?.attributes || {};
  return {
    id: attr.id,
    node_id: nodeId,
    ip: attr.ip || null,
    alias: attr.alias || null,
    port: attr.port ?? null,
    assigned: Boolean(attr.assigned),
  };
}

async function discoverAll({ panelUrl, apiKey }) {
  const [rawNests, rawLocations, rawNodes] = await Promise.all([
    pterodactylClient.fetchAllPages({
      panelUrl,
      apiKey,
      path: '/api/application/nests',
    }),
    pterodactylClient.fetchAllPages({
      panelUrl,
      apiKey,
      path: '/api/application/locations',
    }),
    pterodactylClient.fetchAllPages({
      panelUrl,
      apiKey,
      path: '/api/application/nodes',
    }),
  ]);

  const nests = rawNests.map(normalizeNest).filter((n) => Number.isInteger(n.id));
  const locations = rawLocations.map(normalizeLocation).filter((l) => Number.isInteger(l.id));
  const nodes = rawNodes.map(normalizeNode).filter((n) => Number.isInteger(n.id));

  const eggs = [];
  for (const nest of nests) {
    const rawEggs = await pterodactylClient.fetchAllPages({
      panelUrl,
      apiKey,
      path: `/api/application/nests/${nest.id}/eggs`,
      params: { include: 'variables' },
    });
    for (const rawEgg of rawEggs) {
      const normalized = normalizeEgg(rawEgg, nest.id);
      if (Number.isInteger(normalized.id)) {
        eggs.push(normalized);
      }
    }
  }

  const allocations = [];
  for (const node of nodes) {
    const rawAllocations = await pterodactylClient.fetchAllPages({
      panelUrl,
      apiKey,
      path: `/api/application/nodes/${node.id}/allocations`,
    });
    for (const rawAlloc of rawAllocations) {
      const normalized = normalizeAllocation(rawAlloc, node.id);
      if (Number.isInteger(normalized.id)) {
        allocations.push(normalized);
      }
    }
  }

  return {
    nests,
    eggs,
    locations,
    nodes,
    allocations,
  };
}

module.exports = {
  discoverAll,
};

