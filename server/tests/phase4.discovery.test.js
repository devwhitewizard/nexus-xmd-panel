process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_for_unit_tests_32_chars';
process.env.BWM_API_KEY = 'test_bwm_secret_key_never_expose';
process.env.ENCRYPTION_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const dns = require('dns');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/models/user.model');
jest.mock('../src/models/panelConnection.model');
jest.mock('../src/models/panelResource.model');
jest.mock('../src/models/auditLog.model');

const { encryptSecret } = require('../src/utils/crypto');
const pterodactylClient = require('../src/providers/pterodactyl/pterodactyl.client');
const userModel = require('../src/models/user.model');
const panelConnectionModel = require('../src/models/panelConnection.model');
const panelResourceModel = require('../src/models/panelResource.model');
const auditLogModel = require('../src/models/auditLog.model');
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

function makeToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, username: user.username }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

const ADMIN_TOKEN = makeToken(ADMIN_USER);
const CUSTOMER_TOKEN = makeToken(CUSTOMER_USER);

const SAFE_CONN = {
  id: CONN_UUID,
  provider_key: 'pterodactyl',
  label: 'Pterodactyl VPS 1',
  panel_url: 'https://panel.example.com',
  is_enabled: true,
  connection_status: 'connected',
};

const SYNCED_RESOURCES = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  connection_id: CONN_UUID,
  discovery_status: 'synced',
  discovered_nests: [
    { id: 1, name: 'NodeJS' },
    { id: 2, name: 'Python' },
  ],
  discovered_eggs: [
    { id: 10, nest_id: 1, name: 'WhatsApp Bot Egg' },
    { id: 20, nest_id: 2, name: 'Python Bot Egg' },
  ],
  discovered_locations: [{ id: 1, short: 'EU', long: 'Europe' }],
  discovered_nodes: [
    { id: 1, name: 'EU-Node-1', location_id: 1 },
    { id: 2, name: 'EU-Node-2', location_id: 1 },
  ],
  discovered_allocations: [
    { id: 100, node_id: 1, ip: '203.0.114.50', port: 25565, assigned: false },
    { id: 200, node_id: 2, ip: '203.0.114.51', port: 25566, assigned: false },
  ],
  manual_overrides: {},
  last_synced_at: '2026-11-21T00:00:00.000Z',
  last_attempted_at: '2026-11-21T00:00:00.000Z',
  last_error: null,
};

describe('Phase 4 — Automatic Pterodactyl Resource Discovery & Overrides', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pterodactylClient.resetPterodactylHttpClient();

    userModel.findById.mockImplementation(async (id) => {
      if (id === ADMIN_USER.id) return ADMIN_USER;
      if (id === CUSTOMER_USER.id) return CUSTOMER_USER;
      return null;
    });
    auditLogModel.createAuditLog.mockResolvedValue({ id: 'audit-1' });
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '203.0.114.50', family: 4 }]);
  });

  afterEach(() => {
    dns.promises.lookup.mockRestore();
  });

  it('forbids non-admin customers from accessing resource discovery endpoints', async () => {
    const res = await request(app)
      .get(`/api/panels/connections/${CONN_UUID}/resources`)
      .set('Authorization', `Bearer ${CUSTOMER_TOKEN}`);

    expect(res.status).toBe(403);
  });

  it('discovers nests, eggs, locations, nodes, and allocations with pagination', async () => {
    panelConnectionModel.findEncryptedById.mockResolvedValue({
      ...SAFE_CONN,
      api_key_encrypted: encryptSecret('ptla_valid_key_123456'),
    });
    panelResourceModel.upsertDiscoverySuccess.mockResolvedValue(SYNCED_RESOURCES);

    const mockReq = jest.fn(async ({ url, params }) => {
      if (url.endsWith('/api/application/nests')) {
        if (params.page === 1) {
          return {
            data: {
              object: 'list',
              data: [{ attributes: { id: 1, name: 'NodeJS' } }],
              meta: {
                pagination: {
                  total_pages: 2,
                  links: { next: 'https://panel.example.com/api/application/nests?page=2' },
                },
              },
            },
          };
        }
        return {
          data: {
            object: 'list',
            data: [{ attributes: { id: 2, name: 'Python' } }],
            meta: { pagination: { total_pages: 2 } },
          },
        };
      }
      if (url.endsWith('/api/application/nests/1/eggs')) {
        return {
          data: {
            object: 'list',
            data: [{ attributes: { id: 10, nest: 1, name: 'WhatsApp Bot Egg' } }],
            meta: { pagination: { total_pages: 1 } },
          },
        };
      }
      if (url.endsWith('/api/application/nests/2/eggs')) {
        return {
          data: { object: 'list', data: [], meta: { pagination: { total_pages: 1 } } },
        };
      }
      if (url.endsWith('/api/application/locations')) {
        return {
          data: {
            object: 'list',
            data: [{ attributes: { id: 1, short: 'EU', long: 'Europe' } }],
            meta: { pagination: { total_pages: 1 } },
          },
        };
      }
      if (url.endsWith('/api/application/nodes')) {
        return {
          data: {
            object: 'list',
            data: [{ attributes: { id: 1, name: 'EU-Node-1', location_id: 1, memory: 8192, disk: 50000 } }],
            meta: { pagination: { total_pages: 1 } },
          },
        };
      }
      if (url.endsWith('/api/application/nodes/1/allocations')) {
        return {
          data: {
            object: 'list',
            data: [{ attributes: { id: 100, ip: '203.0.114.50', port: 25565, assigned: false } }],
            meta: { pagination: { total_pages: 1 } },
          },
        };
      }
      return { data: { object: 'list', data: [] } };
    });

    pterodactylClient.setPterodactylHttpClient({ request: mockReq });

    const res = await request(app)
      .post(`/api/panels/connections/${CONN_UUID}/resources/refresh`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(panelResourceModel.upsertDiscoverySuccess).toHaveBeenCalledWith(
      CONN_UUID,
      expect.objectContaining({
        nests: expect.arrayContaining([
          expect.objectContaining({ id: 1 }),
          expect.objectContaining({ id: 2 }),
        ]),
        eggs: [expect.objectContaining({ id: 10, nest_id: 1 })],
        locations: [expect.objectContaining({ id: 1 })],
        nodes: [expect.objectContaining({ id: 1 })],
        allocations: [expect.objectContaining({ id: 100, node_id: 1 })],
      })
    );
  });

  it('rejects pagination links that leave the trusted panel origin', async () => {
    panelConnectionModel.findEncryptedById.mockResolvedValue({
      ...SAFE_CONN,
      api_key_encrypted: encryptSecret('ptla_valid_key_123456'),
    });
    panelResourceModel.recordDiscoveryFailure.mockResolvedValue({
      ...SYNCED_RESOURCES,
      discovery_status: 'failed',
    });

    pterodactylClient.setPterodactylHttpClient({
      request: jest.fn().mockResolvedValue({
        data: {
          object: 'list',
          data: [],
          meta: {
            pagination: {
              total_pages: 2,
              links: { next: 'https://evil-ssrf.example.net/api/application/nests?page=2' },
            },
          },
        },
      }),
    });

    const res = await request(app)
      .post(`/api/panels/connections/${CONN_UUID}/resources/refresh`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('SSRF_BLOCKED_HOST');
    expect(panelResourceModel.recordDiscoveryFailure).toHaveBeenCalledTimes(1);
    expect(panelResourceModel.upsertDiscoverySuccess).not.toHaveBeenCalled();
  });

  it('validates manual overrides against discovered resources and rejects mismatches', async () => {
    panelConnectionModel.findById.mockResolvedValue(SAFE_CONN);
    panelResourceModel.findByConnectionId.mockResolvedValue(SYNCED_RESOURCES);

    // Egg 20 belongs to Nest 2, not Nest 1 -> should fail
    const mismatchEgg = await request(app)
      .put(`/api/panels/connections/${CONN_UUID}/resources/configuration`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ nest_id: 1, egg_id: 20 });

    expect(mismatchEgg.status).toBe(400);
    expect(mismatchEgg.body.error.code).toBe('EGG_NEST_MISMATCH');

    // Allocation 200 belongs to Node 2, not Node 1 -> should fail
    const mismatchAlloc = await request(app)
      .put(`/api/panels/connections/${CONN_UUID}/resources/configuration`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ node_id: 1, allocation_id: 200 });

    expect(mismatchAlloc.status).toBe(400);
    expect(mismatchAlloc.body.error.code).toBe('ALLOCATION_NODE_MISMATCH');

    // Valid overrides
    panelResourceModel.updateManualOverrides.mockResolvedValue({
      ...SYNCED_RESOURCES,
      manual_overrides: { nest_id: 1, egg_id: 10, node_id: 1, allocation_id: 100 },
    });

    const validRes = await request(app)
      .put(`/api/panels/connections/${CONN_UUID}/resources/configuration`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ nest_id: 1, egg_id: 10, node_id: 1, allocation_id: 100 });

    expect(validRes.status).toBe(200);
    expect(validRes.body.data.resources.manual_overrides).toEqual({
      nest_id: 1,
      egg_id: 10,
      node_id: 1,
      allocation_id: 100,
    });
  });

  it('allows clearing a manual override by passing null', async () => {
    panelConnectionModel.findById.mockResolvedValue(SAFE_CONN);
    panelResourceModel.findByConnectionId.mockResolvedValue({
      ...SYNCED_RESOURCES,
      manual_overrides: { nest_id: 1, egg_id: 10 },
    });
    panelResourceModel.updateManualOverrides.mockResolvedValue({
      ...SYNCED_RESOURCES,
      manual_overrides: { nest_id: 1 },
    });

    const res = await request(app)
      .put(`/api/panels/connections/${CONN_UUID}/resources/configuration`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ egg_id: null });

    expect(res.status).toBe(200);
    expect(panelResourceModel.updateManualOverrides).toHaveBeenCalledWith(CONN_UUID, {
      nest_id: 1,
    });
  });
});

