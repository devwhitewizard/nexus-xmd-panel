process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_for_unit_tests_32_chars';
process.env.BWM_API_KEY = 'test_bwm_secret_key_never_expose';
process.env.ENCRYPTION_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/models/user.model');
jest.mock('../src/models/panelConnection.model');
jest.mock('../src/models/panelResource.model');
jest.mock('../src/models/serverPackage.model');
jest.mock('../src/models/auditLog.model');
jest.mock('../src/services/bwm/bwm.client');

const userModel = require('../src/models/user.model');
const panelConnectionModel = require('../src/models/panelConnection.model');
const panelResourceModel = require('../src/models/panelResource.model');
const serverPackageModel = require('../src/models/serverPackage.model');
const auditLogModel = require('../src/models/auditLog.model');
const bwmClient = require('../src/services/bwm/bwm.client');
const { createApp } = require('../src/app');

const app = createApp();

const ADMIN_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@nexus.local',
  username: 'admin',
  role: 'admin',
  is_active: true,
};

const CUSTOMER_USER = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'alice@nexus.local',
  username: 'alice',
  role: 'customer',
  is_active: true,
};

const CONN_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PKG_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BWM_PKG_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function makeToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, username: user.username }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

const ADMIN_TOKEN = makeToken(ADMIN_USER);
const CUSTOMER_TOKEN = makeToken(CUSTOMER_USER);

const ENABLED_CONN = {
  id: CONN_UUID,
  provider_key: 'pterodactyl',
  label: 'VPS 1',
  panel_url: 'https://panel.example.com',
  is_enabled: true,
  connection_status: 'connected',
};

const SYNCED_RESOURCES = {
  connection_id: CONN_UUID,
  last_synced_at: '2026-11-21T00:00:00.000Z',
  discovered_nests: [
    { id: 1, name: 'NodeJS' },
    { id: 2, name: 'Python' },
  ],
  discovered_eggs: [
    { id: 10, nest_id: 1, name: 'WhatsApp Bot' },
    { id: 20, nest_id: 2, name: 'Python Bot' },
  ],
  discovered_locations: [{ id: 1, short: 'EU', long: 'Europe' }],
  discovered_nodes: [
    { id: 1, name: 'Node-1', location_id: 1 },
    { id: 2, name: 'Node-2', location_id: 1 },
  ],
  discovered_allocations: [
    { id: 100, node_id: 1, ip: '203.0.114.50', port: 25565, assigned: false },
    { id: 200, node_id: 2, ip: '203.0.114.51', port: 25566, assigned: false },
  ],
};

const PTERO_PKG = {
  id: PKG_UUID,
  name: 'Starter Pterodactyl',
  description: '512MB Node.js Bot',
  price: '25.0000',
  currency: 'XD',
  provider_key: 'pterodactyl',
  connection_id: CONN_UUID,
  bwm_plan_id: null,
  memory_mb: 512,
  disk_mb: 1024,
  cpu_percent: 100,
  swap_mb: 0,
  io_weight: 500,
  database_limit: 1,
  backup_limit: 1,
  allocation_limit: 1,
  nest_id: 1,
  egg_id: 10,
  location_id: 1,
  node_id: 1,
  allocation_id: 100,
  egg_environment: { NODE_ENV: 'production' },
  is_enabled: true,
  created_at: '2026-11-21T00:00:00.000Z',
};

const BWM_PKG = {
  id: BWM_PKG_UUID,
  name: 'BWM Starter 5GB',
  description: 'Backed by BWM XMD',
  price: '50.0000',
  currency: 'XD',
  provider_key: 'bwm-xmd',
  connection_id: null,
  bwm_plan_id: 's-5g',
  memory_mb: 5120,
  disk_mb: 10240,
  cpu_percent: 100,
  swap_mb: 0,
  io_weight: 500,
  database_limit: 0,
  backup_limit: 0,
  allocation_limit: 1,
  nest_id: null,
  egg_id: null,
  location_id: null,
  node_id: null,
  allocation_id: null,
  egg_environment: {},
  is_enabled: true,
  created_at: '2026-11-21T00:00:00.000Z',
};

describe('Phase 5 — Server Package Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userModel.findById.mockImplementation(async (id) => {
      if (id === ADMIN_USER.id) return ADMIN_USER;
      if (id === CUSTOMER_USER.id) return CUSTOMER_USER;
      return null;
    });
    auditLogModel.createAuditLog.mockResolvedValue({ id: 'audit-1' });
  });

  it('enforces admin-only authorization on package management endpoints', async () => {
    const unauth = await request(app).get('/api/panels/packages');
    expect(unauth.status).toBe(401);

    const custAdminList = await request(app)
      .get('/api/panels/admin/packages')
      .set('Authorization', `Bearer ${CUSTOMER_TOKEN}`);
    expect(custAdminList.status).toBe(403);

    const custCreate = await request(app)
      .post('/api/panels/admin/packages')
      .set('Authorization', `Bearer ${CUSTOMER_TOKEN}`)
      .send({ name: 'Hack', price: 0, provider_key: 'bwm-xmd' });
    expect(custCreate.status).toBe(403);
  });

  it('validates resource limits and prevents negative prices or invalid IO weights', async () => {
    const res = await request(app)
      .post('/api/panels/admin/packages')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        name: 'Bad Limits',
        price: -5,
        provider_key: 'bwm-xmd',
        memory_mb: -100,
        io_weight: 5,
        allocation_limit: 0,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.errors.length).toBeGreaterThanOrEqual(4);
  });

  it('creates a valid BWM XMD package without requiring Pterodactyl connection', async () => {
    bwmClient.request.mockResolvedValue({
      data: { plans: [{ id: 's-5g', name: 'Starter 5GB', price_xd: 50 }] },
    });
    serverPackageModel.createPackage.mockResolvedValue(BWM_PKG);

    const res = await request(app)
      .post('/api/panels/admin/packages')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        name: 'BWM Starter 5GB',
        description: 'Backed by BWM XMD',
        price: 50,
        currency: 'XD',
        provider_key: 'bwm-xmd',
        bwm_plan_id: 's-5g',
        memory_mb: 5120,
        disk_mb: 10240,
        created_by: '99999999-9999-4999-8999-999999999999', // mass-assignment attempt
      });

    expect(res.status).toBe(201);
    expect(res.body.data.package.provider_key).toBe('bwm-xmd');
    expect(serverPackageModel.createPackage).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: ADMIN_USER.id })
    );
  });

  it('rejects Pterodactyl packages with disabled connections, invalid nest/egg, or node/allocation mismatches', async () => {
    panelConnectionModel.findById.mockResolvedValue({ ...ENABLED_CONN, is_enabled: false });
    const disabledRes = await request(app)
      .post('/api/panels/admin/packages')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        name: 'Ptero 1',
        price: 25,
        provider_key: 'pterodactyl',
        connection_id: CONN_UUID,
        nest_id: 1,
        egg_id: 10,
      });
    expect(disabledRes.status).toBe(400);
    expect(disabledRes.body.error.code).toBe('CONNECTION_DISABLED');

    panelConnectionModel.findById.mockResolvedValue(ENABLED_CONN);
    panelResourceModel.findByConnectionId.mockResolvedValue(SYNCED_RESOURCES);

    // Egg 20 belongs to Nest 2, not Nest 1
    const eggMismatch = await request(app)
      .post('/api/panels/admin/packages')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        name: 'Ptero 2',
        price: 25,
        provider_key: 'pterodactyl',
        connection_id: CONN_UUID,
        nest_id: 1,
        egg_id: 20,
      });
    expect(eggMismatch.status).toBe(400);
    expect(eggMismatch.body.error.code).toBe('EGG_NEST_MISMATCH');

    // Allocation 200 belongs to Node 2, not Node 1
    const allocMismatch = await request(app)
      .post('/api/panels/admin/packages')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        name: 'Ptero 3',
        price: 25,
        provider_key: 'pterodactyl',
        connection_id: CONN_UUID,
        nest_id: 1,
        egg_id: 10,
        node_id: 1,
        allocation_id: 200,
      });
    expect(allocMismatch.status).toBe(400);
    expect(allocMismatch.body.error.code).toBe('ALLOCATION_NODE_MISMATCH');
  });

  it('creates a valid Pterodactyl package when all resources match discovered snapshot', async () => {
    panelConnectionModel.findById.mockResolvedValue(ENABLED_CONN);
    panelResourceModel.findByConnectionId.mockResolvedValue(SYNCED_RESOURCES);
    serverPackageModel.createPackage.mockResolvedValue(PTERO_PKG);

    const res = await request(app)
      .post('/api/panels/admin/packages')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        name: 'Starter Pterodactyl',
        price: 25,
        provider_key: 'pterodactyl',
        connection_id: CONN_UUID,
        nest_id: 1,
        egg_id: 10,
        location_id: 1,
        node_id: 1,
        allocation_id: 100,
        egg_environment: { NODE_ENV: 'production' },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.package.id).toBe(PKG_UUID);
  });

  it('filters unavailable or stale packages out of customer read-only list without leaking connection_id', async () => {
    const stalePkg = { ...PTERO_PKG, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', nest_id: 999 };
    serverPackageModel.findAllEnabled.mockResolvedValue([BWM_PKG, PTERO_PKG, stalePkg]);
    panelConnectionModel.findById.mockResolvedValue(ENABLED_CONN);
    panelResourceModel.findByConnectionId.mockResolvedValue(SYNCED_RESOURCES);

    const res = await request(app)
      .get('/api/panels/packages')
      .set('Authorization', `Bearer ${CUSTOMER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.packages).toHaveLength(2);
    expect(res.body.data.packages.find((p) => p.id === stalePkg.id)).toBeUndefined();
    expect(res.body.data.packages[0].connection_id).toBeUndefined();
    expect(res.body.data.packages[0].provider_key).toBeUndefined();
  });

  it('blocks package deletion when servers or orders depend on it', async () => {
    serverPackageModel.findById.mockResolvedValue(PTERO_PKG);
    serverPackageModel.countDependencies.mockResolvedValue({ servers: 1, orders: 2, total: 3 });

    const blocked = await request(app)
      .delete(`/api/panels/admin/packages/${PKG_UUID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('PACKAGE_IN_USE');

    serverPackageModel.countDependencies.mockResolvedValue({ servers: 0, orders: 0, total: 0 });
    serverPackageModel.deleteById.mockResolvedValue({ id: PKG_UUID, name: PTERO_PKG.name });

    const ok = await request(app)
      .delete(`/api/panels/admin/packages/${PKG_UUID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(ok.status).toBe(200);
    expect(ok.body.data.deleted).toBe(true);
  });
});

