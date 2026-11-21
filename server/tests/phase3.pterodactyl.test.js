process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_for_unit_tests_32_chars';
process.env.BWM_API_KEY = 'test_bwm_secret_key_never_expose';
process.env.ENCRYPTION_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/models/user.model');
jest.mock('../src/models/panelConnection.model');
jest.mock('../src/models/auditLog.model');

const { encryptSecret, decryptSecret } = require('../src/utils/crypto');
const { isBlockedIp, validatePanelUrl, createPinnedLookup } = require('../src/utils/ssrfGuard');
const { redactSensitive } = require('../src/utils/logger');
const pterodactylClient = require('../src/providers/pterodactyl/pterodactyl.client');
const userModel = require('../src/models/user.model');
const panelConnectionModel = require('../src/models/panelConnection.model');
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

describe('Phase 3 — Credential Encryption (AES-256-GCM)', () => {
  it('encrypts and decrypts secrets with unique random IVs', () => {
    const key = crypto.randomBytes(32).toString('hex');
    const secret = 'ptla_super_secret_application_key_12345';

    const enc1 = encryptSecret(secret, key);
    const enc2 = encryptSecret(secret, key);

    expect(enc1).toMatch(/^v1:/);
    expect(enc1).not.toEqual(enc2);
    expect(enc1).not.toContain(secret);
    expect(decryptSecret(enc1, key)).toBe(secret);
    expect(decryptSecret(enc2, key)).toBe(secret);
  });

  it('fails safely on missing or invalid encryption master keys', () => {
    expect(() => encryptSecret('secret', '')).toThrow(/ENCRYPTION_MASTER_KEY/);
    expect(() => encryptSecret('secret', 'too-short')).toThrow(/32-byte/);
  });

  it('rejects tampered ciphertext or authentication tags', () => {
    const key = crypto.randomBytes(32).toString('hex');
    const encrypted = encryptSecret('ptla_secret_key', key);
    const parts = encrypted.split(':');
    const tamperedFirstChar = parts[2][0] === 'A' ? 'B' : 'A';
    const tamperedTag = tamperedFirstChar + parts[2].slice(1);
    const tampered = [parts[0], parts[1], tamperedTag, parts[3]].join(':');

    expect(() => decryptSecret(tampered, key)).toThrow(/Failed to decrypt/);
  });
});

describe('Phase 3 — SSRF & DNS Rebinding Protection', () => {
  it('blocks private, loopback, link-local, metadata, and IPv6 internal IPs', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('10.0.0.5')).toBe(true);
    expect(isBlockedIp('172.16.0.1')).toBe(true);
    expect(isBlockedIp('192.168.1.1')).toBe(true);
    expect(isBlockedIp('169.254.169.254')).toBe(true);
    expect(isBlockedIp('0.0.0.0')).toBe(true);
    expect(isBlockedIp('::1')).toBe(true);
    expect(isBlockedIp('fe80::1')).toBe(true);
    expect(isBlockedIp('fc00::1')).toBe(true);
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('1.1.1.1')).toBe(false);
  });

  it('rejects localhost, metadata hostnames, embedded credentials, and non-HTTPS in prod', async () => {
    await expect(validatePanelUrl('https://localhost:8443')).rejects.toMatchObject({
      code: 'SSRF_BLOCKED_HOST',
    });
    await expect(validatePanelUrl('https://metadata.google.internal')).rejects.toMatchObject({
      code: 'SSRF_BLOCKED_HOST',
    });
    await expect(validatePanelUrl('https://user:pass@panel.example.com')).rejects.toMatchObject({
      code: 'INVALID_PANEL_URL',
    });
    await expect(
      validatePanelUrl('http://panel.example.com', { requireHttps: true })
    ).rejects.toMatchObject({
      code: 'HTTPS_REQUIRED',
    });
  });

  it('rejects hostnames resolving to internal IPs and accepts public DNS results', async () => {
    const privateLookup = jest.fn().mockResolvedValue([{ address: '10.10.0.5', family: 4 }]);
    await expect(
      validatePanelUrl('https://panel.example.com', { lookupFn: privateLookup })
    ).rejects.toMatchObject({ code: 'SSRF_BLOCKED_IP' });

    const publicLookup = jest.fn().mockResolvedValue([{ address: '203.0.114.50', family: 4 }]);
    const ok = await validatePanelUrl('https://panel.example.com/admin', {
      requireHttps: true,
      lookupFn: publicLookup,
    });
    expect(ok.normalizedUrl).toBe('https://panel.example.com');
  });

  it('createPinnedLookup blocks DNS rebinding to private IP at socket connect time', (done) => {
    const rebinderLookup = (host, opts, cb) => cb(null, [{ address: '127.0.0.1', family: 4 }]);
    const pinned = createPinnedLookup(rebinderLookup);

    pinned('panel.example.com', {}, (err) => {
      expect(err).toBeDefined();
      expect(err.code).toBe('SSRF_BLOCKED_IP');
      done();
    });
  });

  it('redacts sensitive API keys from logs', () => {
    const cleaned = redactSensitive({
      api_key: 'ptla_secret_12345',
      authorization: 'Bearer ptla_secret_12345',
      label: 'VPS 1',
    });
    expect(cleaned.api_key).toBe('[REDACTED]');
    expect(cleaned.authorization).toBe('[REDACTED]');
    expect(cleaned.label).toBe('VPS 1');
  });
});

describe('Phase 3 — Admin Pterodactyl Connection Endpoints', () => {
  const safeConn = {
    id: CONN_UUID,
    provider_key: 'pterodactyl',
    label: 'Pterodactyl VPS 1',
    panel_url: 'https://panel.example.com',
    description: 'Primary EU VPS',
    is_enabled: true,
    connection_status: 'untested',
    last_tested_at: null,
    last_error: null,
    default_config: {},
    created_by: ADMIN_USER.id,
    created_at: '2026-11-21T00:00:00.000Z',
    updated_at: '2026-11-21T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    pterodactylClient.resetPterodactylHttpClient();

    userModel.findById.mockImplementation(async (id) => {
      if (id === ADMIN_USER.id) return ADMIN_USER;
      if (id === CUSTOMER_USER.id) return CUSTOMER_USER;
      return null;
    });
    auditLogModel.createAuditLog.mockResolvedValue({ id: 'audit-1' });
  });

  it('forbids customers and unauthenticated requests from managing connections', async () => {
    const unauth = await request(app).get('/api/panels/connections');
    expect(unauth.status).toBe(401);

    const cust = await request(app)
      .get('/api/panels/connections')
      .set('Authorization', `Bearer ${CUSTOMER_TOKEN}`);
    expect(cust.status).toBe(403);
  });

  it('creates a connection with encrypted API key and never exposes it in response', async () => {
    // Mock validatePanelUrl via DNS lookup spy
    const dns = require('dns');
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '203.0.114.50', family: 4 }]);
    panelConnectionModel.createConnection.mockResolvedValue(safeConn);

    const res = await request(app)
      .post('/api/panels/connections')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        label: 'Pterodactyl VPS 1',
        panel_url: 'https://panel.example.com',
        api_key: 'ptla_super_secret_app_key_999',
        description: 'Primary EU VPS',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.connection.label).toBe('Pterodactyl VPS 1');
    expect(JSON.stringify(res.body)).not.toContain('ptla_super_secret_app_key_999');
    expect(res.body.data.connection.api_key_encrypted).toBeUndefined();

    const createArg = panelConnectionModel.createConnection.mock.calls[0][0];
    expect(createArg.apiKeyEncrypted).toMatch(/^v1:/);
    expect(decryptSecret(createArg.apiKeyEncrypted)).toBe('ptla_super_secret_app_key_999');

    dns.promises.lookup.mockRestore();
  });

  it('updates connection and rotates API key safely', async () => {
    panelConnectionModel.findById.mockResolvedValue(safeConn);
    panelConnectionModel.updateById.mockResolvedValue({ ...safeConn, label: 'VPS 1 Renamed' });

    const res = await request(app)
      .put(`/api/panels/connections/${CONN_UUID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        label: 'VPS 1 Renamed',
        api_key: 'ptla_new_rotated_key_123456',
      });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('ptla_new_rotated_key_123456');
    const updateArg = panelConnectionModel.updateById.mock.calls[0][1];
    expect(decryptSecret(updateArg.apiKeyEncrypted)).toBe('ptla_new_rotated_key_123456');
  });

  it('toggles connection enabled/disabled status', async () => {
    panelConnectionModel.findById.mockResolvedValue(safeConn);
    panelConnectionModel.setEnabled.mockResolvedValue({ ...safeConn, is_enabled: false });

    const res = await request(app)
      .patch(`/api/panels/connections/${CONN_UUID}/status`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ is_enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.data.connection.is_enabled).toBe(false);
  });

  it('prevents deletion when dependent servers exist', async () => {
    panelConnectionModel.findById.mockResolvedValue(safeConn);
    panelConnectionModel.countDependentServers.mockResolvedValue(2);

    const blocked = await request(app)
      .delete(`/api/panels/connections/${CONN_UUID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CONNECTION_IN_USE');

    panelConnectionModel.countDependentServers.mockResolvedValue(0);
    panelConnectionModel.deleteById.mockResolvedValue({ id: CONN_UUID, label: safeConn.label });

    const deleted = await request(app)
      .delete(`/api/panels/connections/${CONN_UUID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(deleted.status).toBe(200);
    expect(deleted.body.data.deleted).toBe(true);
  });

  it('tests connection against mocked Pterodactyl Application API (success & failure)', async () => {
    const dns = require('dns');
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '203.0.114.50', family: 4 }]);

    const encrypted = encryptSecret('ptla_valid_key_123456');
    panelConnectionModel.findEncryptedById.mockResolvedValue({
      ...safeConn,
      api_key_encrypted: encrypted,
    });
    panelConnectionModel.updateTestStatus.mockResolvedValue({
      ...safeConn,
      connection_status: 'connected',
    });

    pterodactylClient.setPterodactylHttpClient({
      request: jest.fn().mockResolvedValue({
        data: {
          object: 'list',
          data: [{ attributes: { id: 1, name: 'Node 1' } }],
          meta: { pagination: { total: 1 } },
        },
      }),
    });

    const okRes = await request(app)
      .post(`/api/panels/connections/${CONN_UUID}/test`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(okRes.status).toBe(200);
    expect(okRes.body.data.test_result.connected).toBe(true);
    expect(okRes.body.data.test_result.node_count).toBe(1);

    // Failed 401 test
    pterodactylClient.setPterodactylHttpClient({
      request: jest.fn().mockRejectedValue({
        response: { status: 401, data: { errors: [{ detail: 'Invalid token' }] } },
      }),
    });

    const failRes = await request(app)
      .post(`/api/panels/connections/${CONN_UUID}/test`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(failRes.status).toBe(401);
    expect(panelConnectionModel.updateTestStatus).toHaveBeenLastCalledWith(CONN_UUID, {
      connectionStatus: 'failed',
      lastError: 'Invalid Pterodactyl Application API key',
    });

    dns.promises.lookup.mockRestore();
  });
});
