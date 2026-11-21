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
jest.mock('../src/models/order.model');
jest.mock('../src/models/platformSetting.model');
jest.mock('../src/models/auditLog.model');
jest.mock('../src/services/bwm/bwm.client');

const userModel = require('../src/models/user.model');
const panelConnectionModel = require('../src/models/panelConnection.model');
const panelResourceModel = require('../src/models/panelResource.model');
const serverPackageModel = require('../src/models/serverPackage.model');
const orderModel = require('../src/models/order.model');
const platformSettingModel = require('../src/models/platformSetting.model');
const auditLogModel = require('../src/models/auditLog.model');
const bwmClient = require('../src/services/bwm/bwm.client');
const providerAssignmentService = require('../src/services/providerAssignment.service');
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
const ORDER_UUID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

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
  discovered_nests: [{ id: 1, name: 'NodeJS' }],
  discovered_eggs: [{ id: 10, nest_id: 1, name: 'WhatsApp Bot' }],
  discovered_locations: [{ id: 1, short: 'EU', long: 'Europe' }],
  discovered_nodes: [{ id: 1, name: 'Node-1', location_id: 1 }],
  discovered_allocations: [{ id: 100, node_id: 1, ip: '203.0.114.50', port: 25565 }],
};

const PTERO_PKG = {
  id: PKG_UUID,
  name: 'Starter Pterodactyl',
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
};

const BWM_PKG = {
  id: BWM_PKG_UUID,
  name: 'BWM Starter 5GB',
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
};

describe('Phase 6 — Provider Assignment & Selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userModel.findById.mockImplementation(async (id) => {
      if (id === ADMIN_USER.id) return ADMIN_USER;
      if (id === CUSTOMER_USER.id) return CUSTOMER_USER;
      return null;
    });
    platformSettingModel.getSetting.mockResolvedValue(null);
    auditLogModel.createAuditLog.mockResolvedValue({ id: 'audit-1' });
  });

  it('enforces admin-only authorization on provider assignment endpoints', async () => {
    const unauth = await request(app).get('/api/panels/admin/providers');
    expect(unauth.status).toBe(401);

    const custProviders = await request(app)
      .get('/api/panels/admin/providers')
      .set('Authorization', `Bearer ${CUSTOMER_TOKEN}`);
    expect(custProviders.status).toBe(403);

    const custAssign = await request(app)
      .put(`/api/panels/admin/provider-assignments/${PKG_UUID}`)
      .set('Authorization', `Bearer ${CUSTOMER_TOKEN}`)
      .send({ provider_key: 'bwm-xmd' });
    expect(custAssign.status).toBe(403);
  });

  it('lists providers distinguishing declared vs implemented capabilities', async () => {
    const res = await request(app)
      .get('/api/panels/admin/providers')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    const ptero = res.body.data.providers.find((p) => p.key === 'pterodactyl');
    expect(ptero.declared_capabilities.provisionServer).toBe(true);
    expect(ptero.implemented_capabilities.provisionServer).toBe(true);
    expect(ptero.implemented_capabilities.getServerDetails).toBe(true);
    expect(ptero.implemented_capabilities.discoverResources).toBe(true);
  });

  it('resolves Pterodactyl and BWM XMD packages cleanly without exposing credentials', async () => {
    serverPackageModel.findById.mockResolvedValue(PTERO_PKG);
    panelConnectionModel.findById.mockResolvedValue(ENABLED_CONN);
    panelResourceModel.findByConnectionId.mockResolvedValue(SYNCED_RESOURCES);

    const pteroResolved = await providerAssignmentService.resolveProviderForPackage(PKG_UUID);
    expect(pteroResolved.provider_key).toBe('pterodactyl');
    expect(pteroResolved.connection_id).toBe(CONN_UUID);
    expect(pteroResolved.validated_config.agreed_price).toBe('25.0000');
    expect(pteroResolved.connection.api_key_encrypted).toBeUndefined();

    serverPackageModel.findById.mockResolvedValue(BWM_PKG);
    const bwmResolved = await providerAssignmentService.resolveProviderForPackage(BWM_PKG_UUID);
    expect(bwmResolved.provider_key).toBe('bwm-xmd');
    expect(bwmResolved.connection_id).toBeNull();
    expect(bwmResolved.connection).toBeNull();
  });

  it('rejects unknown providers, disabled providers, disabled connections, and stale resources', async () => {
    await expect(
      providerAssignmentService.assertProviderAvailable('heroku', null)
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_PROVIDER' });

    platformSettingModel.getSetting.mockResolvedValueOnce({
      key: 'provider_status:pterodactyl',
      value: { is_enabled: false },
    });
    await expect(
      providerAssignmentService.assertProviderAvailable('pterodactyl', CONN_UUID)
    ).rejects.toMatchObject({ code: 'PROVIDER_DISABLED' });

    panelConnectionModel.findById.mockResolvedValue({ ...ENABLED_CONN, is_enabled: false });
    await expect(
      providerAssignmentService.assertProviderAvailable('pterodactyl', CONN_UUID)
    ).rejects.toMatchObject({ code: 'CONNECTION_DISABLED' });

    serverPackageModel.findById.mockResolvedValue({ ...PTERO_PKG, nest_id: 999 });
    panelConnectionModel.findById.mockResolvedValue(ENABLED_CONN);
    panelResourceModel.findByConnectionId.mockResolvedValue(SYNCED_RESOURCES);

    await expect(
      providerAssignmentService.resolveProviderForPackage(PKG_UUID)
    ).rejects.toMatchObject({ code: 'RESOURCE_CONFIGURATION_STALE' });
  });

  it('rejects incompatible BWM XMD + connection_id assignment', async () => {
    await expect(
      providerAssignmentService.getProviderConnection('bwm-xmd', CONN_UUID)
    ).rejects.toMatchObject({ code: 'PACKAGE_PROVIDER_MISMATCH' });
  });

  it('resolves existing orders from immutable snapshots even if package or connection changed later', async () => {
    const snapshot = providerAssignmentService.buildOrderAssignmentSnapshot(PTERO_PKG);
    orderModel.findById.mockResolvedValue({
      id: ORDER_UUID,
      package_id: PKG_UUID,
      provider_key: 'pterodactyl',
      connection_id: CONN_UUID,
      provider_assignment_snapshot: snapshot,
    });

    const resolved = await providerAssignmentService.resolveProviderForOrder(ORDER_UUID);
    expect(resolved.is_legacy).toBe(false);
    expect(resolved.provider_key).toBe('pterodactyl');
    expect(resolved.connection_id).toBe(CONN_UUID);
    expect(resolved.snapshot.agreed_price).toBe('25.0000');

    // Legacy order without snapshot/provider_key
    orderModel.findById.mockResolvedValue({
      id: ORDER_UUID,
      package_id: null,
      provider_key: null,
      connection_id: null,
      provider_assignment_snapshot: null,
    });
    const legacy = await providerAssignmentService.resolveProviderForOrder(ORDER_UUID);
    expect(legacy.is_legacy).toBe(true);
    expect(legacy.provider_key).toBeNull();
  });

  it('allows admin to reassign a package from Pterodactyl to BWM XMD and validate it', async () => {
    serverPackageModel.findById.mockResolvedValue(PTERO_PKG);
    bwmClient.request.mockResolvedValue({
      data: { plans: [{ id: 's-5g', name: 'Starter 5GB', price_xd: 50 }] },
    });
    serverPackageModel.updateById.mockResolvedValue({
      ...PTERO_PKG,
      provider_key: 'bwm-xmd',
      connection_id: null,
      bwm_plan_id: 's-5g',
    });

    const assignRes = await request(app)
      .put(`/api/panels/admin/provider-assignments/${PKG_UUID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        provider_key: 'bwm-xmd',
        bwm_plan_id: 's-5g',
      });

    expect(assignRes.status).toBe(200);
    expect(auditLogModel.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PACKAGE_PROVIDER_ASSIGNED' })
    );

    serverPackageModel.findById.mockResolvedValue(BWM_PKG);
    const valRes = await request(app)
      .post(`/api/panels/admin/provider-assignments/${BWM_PKG_UUID}/validate`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(valRes.status).toBe(200);
    expect(valRes.body.data.valid).toBe(true);
    expect(valRes.body.data.provider_key).toBe('bwm-xmd');
  });
});

