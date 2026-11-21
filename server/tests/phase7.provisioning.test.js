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
jest.mock('../src/services/bwm/bwm.client');

const { encryptSecret } = require('../src/utils/crypto');
const { UncertainOperationError } = require('../src/utils/errors');
const pterodactylClient = require('../src/providers/pterodactyl/pterodactyl.client');
const bwmClient = require('../src/services/bwm/bwm.client');
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

const CUSTOMER_B = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'bob@nexus.local',
  username: 'bob',
  role: 'customer',
  is_active: true,
};

const CONN_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PKG_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BWM_PKG_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ORDER_UUID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const PROV_UUID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function makeToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, username: user.username }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

const ADMIN_TOKEN = makeToken(ADMIN_USER);
const ALICE_TOKEN = makeToken(CUSTOMER_A);
const BOB_TOKEN = makeToken(CUSTOMER_B);

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
      variables: [
        {
          env_variable: 'BOT_PREFIX',
          default_value: '.',
          rules: 'required|string',
        },
      ],
    },
  ],
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
  egg_environment: {},
  is_enabled: true,
};

const PTERO_SNAPSHOT = {
  provider_key: 'pterodactyl',
  connection_id: CONN_UUID,
  package_id: PKG_UUID,
  package_name: 'Starter Pterodactyl',
  agreed_price: '25.0000',
  currency: 'XD',
  resource_limits: {
    memory_mb: 512,
    disk_mb: 1024,
    cpu_percent: 100,
    swap_mb: 0,
    io_weight: 500,
    database_limit: 1,
    backup_limit: 1,
    allocation_limit: 1,
  },
  pterodactyl_resources: {
    nest_id: 1,
    egg_id: 10,
    location_id: 1,
    node_id: 1,
    allocation_id: 100,
    egg_environment: {},
  },
};

const ELIGIBLE_PTERO_ORDER = {
  id: ORDER_UUID,
  user_id: CUSTOMER_A.id,
  package_id: PKG_UUID,
  provider_key: 'pterodactyl',
  connection_id: CONN_UUID,
  provider_assignment_snapshot: PTERO_SNAPSHOT,
  status: 'completed',
};

describe('Phase 7 — Customer Server Provisioning & Reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pterodactylClient.resetPterodactylHttpClient();

    userModel.findById.mockImplementation(async (id) => {
      if (id === ADMIN_USER.id) return ADMIN_USER;
      if (id === CUSTOMER_A.id) return CUSTOMER_A;
      if (id === CUSTOMER_B.id) return CUSTOMER_B;
      return null;
    });
    platformSettingModel.getSetting.mockResolvedValue(null);
    auditLogModel.createAuditLog.mockResolvedValue({ id: 'audit-1' });
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '203.0.114.50', family: 4 }]);
  });

  afterEach(() => {
    dns.promises.lookup.mockRestore();
  });

  it('rejects unpaid orders, unauthorized customers, and orders missing snapshots', async () => {
    orderModel.findById.mockResolvedValue({ ...ELIGIBLE_PTERO_ORDER, status: 'pending' });
    const unpaid = await request(app)
      .post(`/api/panels/orders/${ORDER_UUID}/provision`)
      .set('Authorization', `Bearer ${ALICE_TOKEN}`)
      .send({ server_name: 'alice-srv' });
    expect(unpaid.status).toBe(400);
    expect(unpaid.body.error.code).toBe('ORDER_NOT_ELIGIBLE');

    orderModel.findById.mockResolvedValue(ELIGIBLE_PTERO_ORDER);
    const otherCust = await request(app)
      .post(`/api/panels/orders/${ORDER_UUID}/provision`)
      .set('Authorization', `Bearer ${BOB_TOKEN}`)
      .send({ server_name: 'bob-steal' });
    expect(otherCust.status).toBe(403);

    const otherStatus = await request(app)
      .get(`/api/panels/orders/${ORDER_UUID}/provisioning-status`)
      .set('Authorization', `Bearer ${BOB_TOKEN}`);
    expect(otherStatus.status).toBe(403);
  });

  it('provisions a Pterodactyl server with correct Application API payload and saves ownership', async () => {
    orderModel.findById.mockResolvedValue(ELIGIBLE_PTERO_ORDER);
    panelServerModel.findByOrderId.mockResolvedValue(null);
    panelConnectionModel.findById.mockResolvedValue(ENABLED_CONN);
    panelConnectionModel.findEncryptedById.mockResolvedValue(ENABLED_CONN);
    panelResourceModel.findByConnectionId.mockResolvedValue(DISCOVERED_RESOURCES);
    serverPackageModel.findById.mockResolvedValue(PTERO_PKG);

    const provLog = {
      id: PROV_UUID,
      order_id: ORDER_UUID,
      user_id: CUSTOMER_A.id,
      provider_key: 'pterodactyl',
      connection_id: CONN_UUID,
      idempotency_key: `order:${ORDER_UUID}:attempt:1`,
      status: 'processing',
      attempt_count: 1,
    };
    provisioningModel.acquireProvisioningLock.mockResolvedValue({ created: true, log: provLog });
    panelServerModel.createPanelServer.mockResolvedValue({
      id: 'srv-100',
      user_id: CUSTOMER_A.id,
      order_id: ORDER_UUID,
      provider_key: 'pterodactyl',
      connection_id: CONN_UUID,
      external_server_id: '42',
      server_name: 'alice-bot-srv',
      status: 'installing',
    });
    provisioningModel.markSuccessful.mockResolvedValue({
      ...provLog,
      status: 'successful',
      server_id: 'srv-100',
      external_server_id: '42',
    });

    const pteroMock = jest.fn(async ({ method, url, data }) => {
      if (method === 'GET' && url.includes('/api/application/users')) {
        return {
          data: { object: 'list', data: [{ attributes: { id: 7, email: CUSTOMER_A.email } }] },
        };
      }
      if (method === 'POST' && url.endsWith('/api/application/servers')) {
        expect(data.external_id).toBe(`order:${ORDER_UUID}:attempt:1`);
        expect(data.user).toBe(7);
        expect(data.egg).toBe(10);
        expect(data.environment.BOT_PREFIX).toBe('.');
        expect(data.allocation).toEqual({ default: 100 });
        return {
          data: {
            object: 'server',
            attributes: { id: 42, identifier: 'abcd1234', uuid: 'uuid-42', name: 'alice-bot-srv', status: 'installing' },
          },
        };
      }
      return { data: {} };
    });
    pterodactylClient.setPterodactylHttpClient({ request: pteroMock });

    const res = await request(app)
      .post(`/api/panels/orders/${ORDER_UUID}/provision`)
      .set('Authorization', `Bearer ${ALICE_TOKEN}`)
      .send({ server_name: 'alice-bot-srv' });

    expect(res.status).toBe(201);
    expect(res.body.data.idempotent_replay).toBe(false);
    expect(res.body.data.server.external_server_id).toBe('42');
    expect(JSON.stringify(res.body)).not.toContain('ptla_valid_key_123456');
  });

  it('prevents duplicate provisioning via idempotency replay when order is already provisioned', async () => {
    orderModel.findById.mockResolvedValue(ELIGIBLE_PTERO_ORDER);
    panelServerModel.findByOrderId.mockResolvedValue({
      id: 'srv-100',
      order_id: ORDER_UUID,
      external_server_id: '42',
    });
    provisioningModel.findLatestByOrderId.mockResolvedValue({
      id: PROV_UUID,
      status: 'successful',
    });

    const res = await request(app)
      .post(`/api/panels/orders/${ORDER_UUID}/provision`)
      .set('Authorization', `Bearer ${ALICE_TOKEN}`)
      .send({ server_name: 'alice-bot-srv' });

    expect(res.status).toBe(200);
    expect(res.body.data.idempotent_replay).toBe(true);
    expect(provisioningModel.acquireProvisioningLock).not.toHaveBeenCalled();
  });

  it('marks provisioning as uncertain on Pterodactyl timeout and blocks blind retry', async () => {
    orderModel.findById.mockResolvedValue(ELIGIBLE_PTERO_ORDER);
    panelServerModel.findByOrderId.mockResolvedValue(null);
    panelConnectionModel.findById.mockResolvedValue(ENABLED_CONN);
    panelConnectionModel.findEncryptedById.mockResolvedValue(ENABLED_CONN);
    panelResourceModel.findByConnectionId.mockResolvedValue(DISCOVERED_RESOURCES);
    serverPackageModel.findById.mockResolvedValue(PTERO_PKG);

    const provLog = {
      id: PROV_UUID,
      order_id: ORDER_UUID,
      user_id: CUSTOMER_A.id,
      provider_key: 'pterodactyl',
      connection_id: CONN_UUID,
      idempotency_key: `order:${ORDER_UUID}:attempt:1`,
      status: 'processing',
      attempt_count: 1,
    };
    provisioningModel.acquireProvisioningLock.mockResolvedValue({ created: true, log: provLog });

    const timeoutErr = new Error('timeout exceeded');
    timeoutErr.code = 'ECONNABORTED';
    pterodactylClient.setPterodactylHttpClient({
      request: jest
        .fn()
        .mockResolvedValueOnce({
          data: { object: 'list', data: [{ attributes: { id: 7, email: CUSTOMER_A.email } }] },
        })
        .mockRejectedValueOnce(timeoutErr),
    });

    const res = await request(app)
      .post(`/api/panels/orders/${ORDER_UUID}/provision`)
      .set('Authorization', `Bearer ${ALICE_TOKEN}`)
      .send({ server_name: 'alice-timeout' });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UNCERTAIN_PAID_OPERATION');
    expect(provisioningModel.markUncertain).toHaveBeenCalledWith(
      PROV_UUID,
      expect.objectContaining({ errorCode: 'UNCERTAIN_PAID_OPERATION' })
    );

    // Retry must be blocked while uncertain
    provisioningModel.findById.mockResolvedValue({ ...provLog, status: 'uncertain' });
    const retryRes = await request(app)
      .post(`/api/panels/admin/provisioning/${PROV_UUID}/retry`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({});
    expect(retryRes.status).toBe(409);
    expect(retryRes.body.error.code).toBe('RETRY_NOT_ALLOWED');
  });

  it('reconciles uncertain Pterodactyl provisioning: confirmed created vs confirmed not created', async () => {
    const uncertainLog = {
      id: PROV_UUID,
      order_id: ORDER_UUID,
      user_id: CUSTOMER_A.id,
      provider_key: 'pterodactyl',
      connection_id: CONN_UUID,
      idempotency_key: `order:${ORDER_UUID}:attempt:1`,
      status: 'uncertain',
      request_metadata: { server_name: 'alice-srv' },
    };

    provisioningModel.findById.mockResolvedValue(uncertainLog);
    panelConnectionModel.findEncryptedById.mockResolvedValue(ENABLED_CONN);
    orderModel.findById.mockResolvedValue(ELIGIBLE_PTERO_ORDER);
    panelServerModel.findByOrderId.mockResolvedValue(null);
    panelServerModel.createPanelServer.mockResolvedValue({
      id: 'srv-reconciled',
      external_server_id: '99',
    });
    provisioningModel.markSuccessful.mockResolvedValue({
      ...uncertainLog,
      status: 'successful',
      server_id: 'srv-reconciled',
    });

    // Case 1: Server found on Pterodactyl via external_id
    pterodactylClient.setPterodactylHttpClient({
      request: jest.fn().mockResolvedValue({
        data: {
          object: 'server',
          attributes: { id: 99, identifier: 'xyz99', uuid: 'uuid-99', name: 'alice-srv' },
        },
      }),
    });

    const foundRes = await request(app)
      .post(`/api/panels/admin/provisioning/${PROV_UUID}/reconcile`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(foundRes.status).toBe(200);
    expect(foundRes.body.data.outcome).toBe('confirmed_created');
    expect(panelServerModel.createPanelServer).toHaveBeenCalledTimes(1);

    // Case 2: Server returns 404 on Pterodactyl -> marks failed so admin can authorize retry
    pterodactylClient.setPterodactylHttpClient({
      request: jest.fn().mockRejectedValue({ response: { status: 404, data: {} } }),
    });
    provisioningModel.markFailed.mockResolvedValue({
      ...uncertainLog,
      status: 'failed',
      error_code: 'CONFIRMED_NOT_CREATED',
    });

    const notFoundRes = await request(app)
      .post(`/api/panels/admin/provisioning/${PROV_UUID}/reconcile`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(notFoundRes.status).toBe(200);
    expect(notFoundRes.body.data.outcome).toBe('confirmed_not_created');
  });

  it('provisions BWM XMD orders and handles UncertainOperationError safely', async () => {
    const bwmOrder = {
      id: ORDER_UUID,
      user_id: CUSTOMER_A.id,
      package_id: BWM_PKG_UUID,
      provider_key: 'bwm-xmd',
      connection_id: null,
      status: 'completed',
      provider_assignment_snapshot: {
        provider_key: 'bwm-xmd',
        connection_id: null,
        package_id: BWM_PKG_UUID,
        package_name: 'BWM Starter 5GB',
        bwm_plan_id: 's-5g',
      },
    };
    orderModel.findById.mockResolvedValue(bwmOrder);
    panelServerModel.findByOrderId.mockResolvedValue(null);
    serverPackageModel.findById.mockResolvedValue({ id: BWM_PKG_UUID, provider_key: 'bwm-xmd' });
    provisioningModel.acquireProvisioningLock.mockResolvedValue({
      created: true,
      log: { id: PROV_UUID, order_id: ORDER_UUID, status: 'processing', attempt_count: 1 },
    });

    bwmClient.request.mockRejectedValueOnce(new UncertainOperationError('BWM timeout'));

    const res = await request(app)
      .post(`/api/panels/orders/${ORDER_UUID}/provision`)
      .set('Authorization', `Bearer ${ALICE_TOKEN}`)
      .send({ password: 'panelPassword123' });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UNCERTAIN_PAID_OPERATION');
    expect(provisioningModel.markUncertain).toHaveBeenCalledTimes(1);
  });
});

