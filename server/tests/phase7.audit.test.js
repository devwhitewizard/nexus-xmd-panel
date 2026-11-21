process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_for_unit_tests_32_chars';
process.env.BWM_API_KEY = 'test_bwm_secret_key_never_expose';
process.env.ENCRYPTION_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const dns = require('dns');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/models/user.model');
jest.mock('../src/models/order.model');
jest.mock('../src/models/serverPackage.model');
jest.mock('../src/models/panelConnection.model');
jest.mock('../src/models/panelResource.model');
jest.mock('../src/models/panelServer.model');
jest.mock('../src/models/provisioning.model');
jest.mock('../src/models/platformSetting.model');
jest.mock('../src/models/auditLog.model');

const { encryptSecret } = require('../src/utils/crypto');
const pterodactylClient = require('../src/providers/pterodactyl/pterodactyl.client');
const userModel = require('../src/models/user.model');
const orderModel = require('../src/models/order.model');
const serverPackageModel = require('../src/models/serverPackage.model');
const panelConnectionModel = require('../src/models/panelConnection.model');
const panelResourceModel = require('../src/models/panelResource.model');
const panelServerModel = require('../src/models/panelServer.model');
const provisioningModel = require('../src/models/provisioning.model');
const platformSettingModel = require('../src/models/platformSetting.model');
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

const CUSTOMER_A = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'alice@nexus.local',
  username: 'alice',
  role: 'customer',
  is_active: true,
};

const CONN_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PKG_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ORDER_UUID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const PROV_UUID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function makeToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, username: user.username }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

const ADMIN_TOKEN = makeToken(ADMIN_USER);
const ALICE_TOKEN = makeToken(CUSTOMER_A);

const ENABLED_CONN = {
  id: CONN_UUID,
  provider_key: 'pterodactyl',
  label: 'VPS 1',
  panel_url: 'https://panel.example.com',
  is_enabled: true,
  connection_status: 'connected',
  api_key_encrypted: encryptSecret('ptla_valid_key_123456'),
};

const DISCOVERED_RESOURCES = {
  connection_id: CONN_UUID,
  last_synced_at: '2026-11-21T00:00:00.000Z',
  discovered_nests: [{ id: 1, name: 'NodeJS' }],
  discovered_eggs: [
    {
      id: 10,
      nest_id: 1,
      name: 'NodeJS Bot',
      docker_image: 'ghcr.io/parkervcp/yolks:nodejs_20',
      startup: 'node index.js',
      variables: [],
    },
  ],
  discovered_locations: [{ id: 1, short: 'EU', long: 'Europe' }],
  discovered_nodes: [{ id: 1, name: 'Node-1', location_id: 1 }],
  discovered_allocations: [{ id: 100, node_id: 1, ip: '203.0.114.50', port: 25565 }],
};

const ELIGIBLE_ORDER = {
  id: ORDER_UUID,
  user_id: CUSTOMER_A.id,
  package_id: PKG_UUID,
  provider_key: 'pterodactyl',
  connection_id: CONN_UUID,
  status: 'completed',
  provider_assignment_snapshot: {
    provider_key: 'pterodactyl',
    connection_id: CONN_UUID,
    package_id: PKG_UUID,
    package_name: 'Starter',
    resource_limits: { memory_mb: 512, disk_mb: 1024, cpu_percent: 100 },
    pterodactyl_resources: { nest_id: 1, egg_id: 10, location_id: 1, node_id: 1, allocation_id: 100 },
  },
};

describe('Phase 7 Security, Reliability & Recovery Audit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pterodactylClient.resetPterodactylHttpClient();

    userModel.findById.mockImplementation(async (id) => {
      if (id === ADMIN_USER.id) return ADMIN_USER;
      if (id === CUSTOMER_A.id) return CUSTOMER_A;
      return null;
    });
    platformSettingModel.getSetting.mockResolvedValue(null);
    auditLogModel.createAuditLog.mockResolvedValue({ id: 'audit-1' });
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '203.0.114.50', family: 4 }]);
  });

  afterEach(() => {
    dns.promises.lookup.mockRestore();
  });

  it('rejects failed, refunded, and uncertain order statuses and ignores frontend provider overrides', async () => {
    for (const status of ['pending', 'failed', 'refunded', 'uncertain']) {
      orderModel.findById.mockResolvedValue({ ...ELIGIBLE_ORDER, status });
      const res = await request(app)
        .post(`/api/panels/orders/${ORDER_UUID}/provision`)
        .set('Authorization', `Bearer ${ALICE_TOKEN}`)
        .send({
          server_name: 'alice-srv',
          provider_key: 'bwm-xmd',
          connection_id: '99999999-9999-4999-8999-999999999999',
          price: 0,
          status: 'completed',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ORDER_NOT_ELIGIBLE');
    }
  });

  it('findOrCreateUser rejects substring email matches and creates/matches exact email only', async () => {
    const mockReq = jest
      .fn()
      // Search returns a different user whose email merely contains the query substring
      .mockResolvedValueOnce({
        data: {
          object: 'list',
          data: [{ attributes: { id: 99, email: 'not-alice@nexus.local' } }],
        },
      })
      // Should proceed to create the exact user
      .mockResolvedValueOnce({
        data: {
          object: 'user',
          attributes: { id: 101, email: 'alice@nexus.local', username: 'alice' },
        },
      });

    pterodactylClient.setPterodactylHttpClient({ request: mockReq });

    const user = await pterodactylClient.findOrCreateUser({
      panelUrl: 'https://panel.example.com',
      apiKey: 'ptla_valid_key_123456',
      email: 'alice@nexus.local',
      username: 'alice',
    });

    expect(user.id).toBe(101);
    expect(mockReq).toHaveBeenCalledTimes(2);
  });

  it('blocks concurrent/stale processing logs from blind retry and allows admin reconciliation', async () => {
    // Simulate a stale `processing` log left behind after an app crash
    const staleProcessingLog = {
      id: PROV_UUID,
      order_id: ORDER_UUID,
      user_id: CUSTOMER_A.id,
      provider_key: 'pterodactyl',
      connection_id: CONN_UUID,
      idempotency_key: `order:${ORDER_UUID}:attempt:1`,
      status: 'processing',
      attempt_count: 1,
      request_metadata: { server_name: 'alice-srv' },
    };

    orderModel.findById.mockResolvedValue(ELIGIBLE_ORDER);
    panelServerModel.findByOrderId.mockResolvedValue(null);
    panelConnectionModel.findById.mockResolvedValue(ENABLED_CONN);
    panelConnectionModel.findEncryptedById.mockResolvedValue(ENABLED_CONN);
    panelResourceModel.findByConnectionId.mockResolvedValue(DISCOVERED_RESOURCES);
    serverPackageModel.findById.mockResolvedValue({ id: PKG_UUID, is_enabled: true });
    provisioningModel.acquireProvisioningLock.mockResolvedValue({
      created: false,
      log: staleProcessingLog,
    });

    const dupRes = await request(app)
      .post(`/api/panels/orders/${ORDER_UUID}/provision`)
      .set('Authorization', `Bearer ${ALICE_TOKEN}`)
      .send({ server_name: 'alice-srv' });
    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.code).toBe('PROVISIONING_IN_PROGRESS');

    provisioningModel.findById.mockResolvedValue(staleProcessingLog);
    const retryRes = await request(app)
      .post(`/api/panels/admin/provisioning/${PROV_UUID}/retry`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({});
    expect(retryRes.status).toBe(409);
    expect(retryRes.body.error.code).toBe('RETRY_NOT_ALLOWED');

    // Admin reconcile recovers the server created before the crash
    pterodactylClient.setPterodactylHttpClient({
      request: jest.fn().mockResolvedValue({
        data: {
          object: 'server',
          attributes: { id: 77, identifier: 'id77', uuid: 'uuid-77', name: 'alice-srv' },
        },
      }),
    });
    panelServerModel.createPanelServer.mockResolvedValue({ id: 'srv-77', external_server_id: '77' });
    provisioningModel.markSuccessful.mockResolvedValue({
      ...staleProcessingLog,
      status: 'successful',
      server_id: 'srv-77',
    });

    const recRes = await request(app)
      .post(`/api/panels/admin/provisioning/${PROV_UUID}/reconcile`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(recRes.status).toBe(200);
    expect(recRes.body.data.outcome).toBe('confirmed_created');
  });

  it('marks provisioning uncertain when DB persistence fails after external server creation', async () => {
    orderModel.findById.mockResolvedValue(ELIGIBLE_ORDER);
    panelServerModel.findByOrderId.mockResolvedValue(null);
    panelConnectionModel.findById.mockResolvedValue(ENABLED_CONN);
    panelConnectionModel.findEncryptedById.mockResolvedValue(ENABLED_CONN);
    panelResourceModel.findByConnectionId.mockResolvedValue(DISCOVERED_RESOURCES);
    serverPackageModel.findById.mockResolvedValue({ id: PKG_UUID, is_enabled: true });
    provisioningModel.acquireProvisioningLock.mockResolvedValue({
      created: true,
      log: { id: PROV_UUID, order_id: ORDER_UUID, status: 'processing', attempt_count: 1 },
    });

    pterodactylClient.setPterodactylHttpClient({
      request: jest
        .fn()
        .mockResolvedValueOnce({
          data: { object: 'list', data: [{ attributes: { id: 7, email: CUSTOMER_A.email } }] },
        })
        .mockResolvedValueOnce({
          data: { object: 'server', attributes: { id: 88, identifier: 'id88', uuid: 'u88' } },
        }),
    });

    panelServerModel.createPanelServer.mockRejectedValue(new Error('DB connection lost'));

    const res = await request(app)
      .post(`/api/panels/orders/${ORDER_UUID}/provision`)
      .set('Authorization', `Bearer ${ALICE_TOKEN}`)
      .send({ server_name: 'alice-srv' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DB_PERSISTENCE_FAILED');
    expect(provisioningModel.markUncertain).toHaveBeenCalledWith(
      PROV_UUID,
      expect.objectContaining({
        externalServerId: '88',
        errorCode: 'DB_PERSISTENCE_FAILED',
      })
    );
  });

  it('leaves log uncertain if reconciliation lookup times out or returns malformed payload', async () => {
    const uncertainLog = {
      id: PROV_UUID,
      order_id: ORDER_UUID,
      user_id: CUSTOMER_A.id,
      provider_key: 'pterodactyl',
      connection_id: CONN_UUID,
      idempotency_key: `order:${ORDER_UUID}:attempt:1`,
      status: 'uncertain',
    };
    provisioningModel.findById.mockResolvedValue(uncertainLog);
    panelConnectionModel.findEncryptedById.mockResolvedValue(ENABLED_CONN);

    pterodactylClient.setPterodactylHttpClient({
      request: jest.fn().mockResolvedValue({ data: { unexpected: true } }),
    });

    const res = await request(app)
      .post(`/api/panels/admin/provisioning/${PROV_UUID}/reconcile`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('PTERODACTYL_INVALID_RESPONSE');
    expect(provisioningModel.markSuccessful).not.toHaveBeenCalled();
    expect(provisioningModel.markFailed).not.toHaveBeenCalled();
  });
});

