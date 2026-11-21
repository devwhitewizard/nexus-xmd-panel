process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_for_unit_tests_32_chars';
process.env.BWM_API_KEY = 'test_bwm_secret_key_never_expose';
process.env.ENCRYPTION_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const dns = require('dns');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/models/user.model');
jest.mock('../src/models/panelServer.model');
jest.mock('../src/models/panelConnection.model');
jest.mock('../src/models/serverPackage.model');
jest.mock('../src/models/auditLog.model');

const { encryptSecret } = require('../src/utils/crypto');
const pterodactylClient = require('../src/providers/pterodactyl/pterodactyl.client');
const userModel = require('../src/models/user.model');
const panelServerModel = require('../src/models/panelServer.model');
const panelConnectionModel = require('../src/models/panelConnection.model');
const serverPackageModel = require('../src/models/serverPackage.model');
const auditLogModel = require('../src/models/auditLog.model');
const { createApp } = require('../src/app');

const app = createApp();

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
const PTERO_SRV_UUID = '12121212-1212-4121-8121-121212121212';
const BWM_SRV_UUID = '34343434-3434-4343-8343-343434343434';

function makeToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, username: user.username }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

const ALICE_TOKEN = makeToken(CUSTOMER_A);
const BOB_TOKEN = makeToken(CUSTOMER_B);

const PTERO_SERVER = {
  id: PTERO_SRV_UUID,
  user_id: CUSTOMER_A.id,
  order_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  package_id: PKG_UUID,
  provider_key: 'pterodactyl',
  connection_id: CONN_UUID,
  external_server_id: '42',
  plan_id: PKG_UUID,
  plan_name: 'Starter Pterodactyl',
  server_name: 'alice-ptero-srv',
  panel_url: 'https://panel.example.com',
  username: 'alice',
  status: 'active',
  provider_metadata: { identifier: 'abcd1234', uuid: 'uuid-42' },
  created_at: '2026-11-21T00:00:00.000Z',
  updated_at: '2026-11-21T00:00:00.000Z',
};

const BWM_SERVER = {
  id: BWM_SRV_UUID,
  user_id: CUSTOMER_A.id,
  order_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  package_id: null,
  provider_key: 'bwm-xmd',
  connection_id: null,
  bwm_panel_id: 'bwm-99',
  external_server_id: 'bwm-99',
  plan_id: 's-5g',
  plan_name: 'Starter 5GB',
  server_name: 'alice-bwm-srv',
  panel_url: 'https://bwm.example.com',
  username: 'alice',
  status: 'active',
  created_at: '2026-11-21T00:00:00.000Z',
  updated_at: '2026-11-21T00:00:00.000Z',
};

describe('Phase 8 — Customer Server Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pterodactylClient.resetPterodactylHttpClient();

    userModel.findById.mockImplementation(async (id) => {
      if (id === CUSTOMER_A.id) return CUSTOMER_A;
      if (id === CUSTOMER_B.id) return CUSTOMER_B;
      return null;
    });
    auditLogModel.createAuditLog.mockResolvedValue({ id: 'audit-1' });
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '203.0.114.50', family: 4 }]);
  });

  afterEach(() => {
    dns.promises.lookup.mockRestore();
  });

  it('lists only owned servers with pagination & filtering and never exposes connection_id', async () => {
    panelServerModel.findPaginated.mockResolvedValue({
      servers: [PTERO_SERVER],
      total: 1,
    });

    const res = await request(app)
      .get('/api/panels/servers?provider_key=pterodactyl&limit=10&offset=0')
      .set('Authorization', `Bearer ${ALICE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.servers).toHaveLength(1);
    expect(res.body.data.servers[0].connection_id).toBeUndefined();
    expect(panelServerModel.findPaginated).toHaveBeenCalledWith({
      userId: CUSTOMER_A.id,
      isAdmin: false,
      status: null,
      providerKey: 'pterodactyl',
      limit: 10,
      offset: 0,
    });
  });

  it('enforces ownership on GET /api/panels/servers/:id and power endpoints', async () => {
    panelServerModel.findById.mockResolvedValue(PTERO_SERVER);

    const detailsDenied = await request(app)
      .get(`/api/panels/servers/${PTERO_SRV_UUID}`)
      .set('Authorization', `Bearer ${BOB_TOKEN}`);
    expect(detailsDenied.status).toBe(403);

    const powerDenied = await request(app)
      .post(`/api/panels/servers/${PTERO_SRV_UUID}/power/start`)
      .set('Authorization', `Bearer ${BOB_TOKEN}`);
    expect(powerDenied.status).toBe(403);
  });

  it('returns live details for Pterodactyl servers and unsupported notice for BWM XMD', async () => {
    panelServerModel.findById.mockResolvedValue(PTERO_SERVER);
    serverPackageModel.findById.mockResolvedValue({
      id: PKG_UUID,
      name: 'Starter Pterodactyl',
      memory_mb: 512,
      disk_mb: 1024,
      cpu_percent: 100,
    });
    panelConnectionModel.findEncryptedById.mockResolvedValue({
      id: CONN_UUID,
      panel_url: 'https://panel.example.com',
      is_enabled: true,
      api_key_encrypted: encryptSecret('ptla_valid_key_123456'),
    });
    pterodactylClient.setPterodactylHttpClient({
      request: jest.fn().mockResolvedValue({
        data: {
          object: 'server',
          attributes: { id: 42, identifier: 'abcd1234', uuid: 'uuid-42', name: 'alice-ptero-srv', suspended: false },
        },
      }),
    });

    const pteroRes = await request(app)
      .get(`/api/panels/servers/${PTERO_SRV_UUID}`)
      .set('Authorization', `Bearer ${ALICE_TOKEN}`);

    expect(pteroRes.status).toBe(200);
    expect(pteroRes.body.data.live_status).toBe('available');
    expect(pteroRes.body.data.live_details.identifier).toBe('abcd1234');

    // BWM XMD server returns local details + live_status: 'unsupported' (never fabricated)
    panelServerModel.findById.mockResolvedValue(BWM_SERVER);
    const bwmRes = await request(app)
      .get(`/api/panels/servers/${BWM_SRV_UUID}`)
      .set('Authorization', `Bearer ${ALICE_TOKEN}`);

    expect(bwmRes.status).toBe(200);
    expect(bwmRes.body.data.live_status).toBe('unsupported');
    expect(bwmRes.body.data.live_details).toBeNull();
  });

  it('executes Pterodactyl power actions (start/stop/restart) and rejects BWM power actions with 501', async () => {
    panelServerModel.findById.mockResolvedValue(PTERO_SERVER);
    panelConnectionModel.findEncryptedById.mockResolvedValue({
      id: CONN_UUID,
      panel_url: 'https://panel.example.com',
      is_enabled: true,
      api_key_encrypted: encryptSecret('ptla_valid_key_123456'),
    });
    pterodactylClient.setPterodactylHttpClient({
      request: jest.fn().mockResolvedValue({ data: '' }),
    });

    for (const action of ['start', 'stop', 'restart']) {
      const res = await request(app)
        .post(`/api/panels/servers/${PTERO_SRV_UUID}/power/${action}`)
        .set('Authorization', `Bearer ${ALICE_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.accepted).toBe(true);
      expect(res.body.data.signal).toBe(action);
    }

    // BWM XMD power action must fail with 501 UNSUPPORTED_PROVIDER_CAPABILITY
    panelServerModel.findById.mockResolvedValue(BWM_SERVER);
    const bwmStart = await request(app)
      .post(`/api/panels/servers/${BWM_SRV_UUID}/power/start`)
      .set('Authorization', `Bearer ${ALICE_TOKEN}`);
    expect(bwmStart.status).toBe(501);
    expect(bwmStart.body.error.code).toBe('UNSUPPORTED_PROVIDER_CAPABILITY');
  });

  it('returns live resources for Pterodactyl and rejects BWM with 501', async () => {
    panelServerModel.findById.mockResolvedValue(PTERO_SERVER);
    panelConnectionModel.findEncryptedById.mockResolvedValue({
      id: CONN_UUID,
      panel_url: 'https://panel.example.com',
      is_enabled: true,
      api_key_encrypted: encryptSecret('ptla_valid_key_123456'),
    });
    pterodactylClient.setPterodactylHttpClient({
      request: jest.fn().mockResolvedValue({
        data: {
          attributes: {
            current_state: 'running',
            is_suspended: false,
            resources: { memory_bytes: 104857600, cpu_absolute: 12.5 },
          },
        },
      }),
    });

    const pteroRes = await request(app)
      .get(`/api/panels/servers/${PTERO_SRV_UUID}/resources`)
      .set('Authorization', `Bearer ${ALICE_TOKEN}`);
    expect(pteroRes.status).toBe(200);
    expect(pteroRes.body.data.resources.current_state).toBe('running');

    panelServerModel.findById.mockResolvedValue(BWM_SERVER);
    const bwmRes = await request(app)
      .get(`/api/panels/servers/${BWM_SRV_UUID}/resources`)
      .set('Authorization', `Bearer ${ALICE_TOKEN}`);
    expect(bwmRes.status).toBe(501);
    expect(bwmRes.body.error.code).toBe('UNSUPPORTED_PROVIDER_CAPABILITY');
  });
});

