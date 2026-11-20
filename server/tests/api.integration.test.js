process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_for_unit_tests_32_chars';
process.env.BWM_API_KEY = 'test_bwm_secret_key_never_expose';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/models/user.model');
jest.mock('../src/models/bot.model');
jest.mock('../src/models/panelServer.model');
jest.mock('../src/models/order.model');
jest.mock('../src/models/transaction.model');
jest.mock('../src/models/auditLog.model');
jest.mock('../src/services/bwm/bwm.client');

const { createApp } = require('../src/app');
const userModel = require('../src/models/user.model');
const botModel = require('../src/models/bot.model');
const panelServerModel = require('../src/models/panelServer.model');
const orderModel = require('../src/models/order.model');
const transactionModel = require('../src/models/transaction.model');
const auditLogModel = require('../src/models/auditLog.model');
const bwmClient = require('../src/services/bwm/bwm.client');
const {
  InsufficientBalanceError,
  UncertainOperationError,
} = require('../src/utils/errors');

const app = createApp();

const ADMIN_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@nexus.local',
  username: 'admin',
  role: 'admin',
  is_active: true,
  wallet_balance: '0.0000',
};

const CUSTOMER_A = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'alice@nexus.local',
  username: 'alice',
  role: 'customer',
  is_active: true,
  wallet_balance: '0.0000',
};

const CUSTOMER_B = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'bob@nexus.local',
  username: 'bob',
  role: 'customer',
  is_active: true,
  wallet_balance: '0.0000',
};

function makeToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, username: user.username }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

const ADMIN_TOKEN = makeToken(ADMIN_USER);
const ALICE_TOKEN = makeToken(CUSTOMER_A);
const BOB_TOKEN = makeToken(CUSTOMER_B);

const ALICE_BOT = {
  id: '44444444-4444-4444-8444-444444444444',
  user_id: CUSTOMER_A.id,
  bwm_bot_id: 'bwm-bot-001',
  app_name: 'alice-bot-1',
  custom_name: 'Alice Bot',
  template_id: '55555555-5555-4555-8555-555555555555',
  status: 'running',
  deployed_at: '2026-11-01T00:00:00.000Z',
  expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
};

describe('Nexus XMD Reseller Backend API', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    userModel.findById.mockImplementation(async (id) => {
      if (id === ADMIN_USER.id) return ADMIN_USER;
      if (id === CUSTOMER_A.id) return CUSTOMER_A;
      if (id === CUSTOMER_B.id) return CUSTOMER_B;
      return null;
    });

    auditLogModel.createAuditLog.mockResolvedValue({ id: 'audit-1' });
    orderModel.createOrder.mockResolvedValue({ id: 'order-1', status: 'pending' });
    orderModel.updateOrder.mockResolvedValue({ id: 'order-1', status: 'completed' });
    transactionModel.createTransaction.mockResolvedValue({ id: 'tx-1' });
  });

  describe('Health & Auth', () => {
    it('GET /health returns 200', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
    });

    it('rejects unauthenticated access to protected routes', async () => {
      const res = await request(app).get('/api/bots');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Account Integration (Admin Only)', () => {
    it('forbids customers from reading reseller account balance', async () => {
      const res = await request(app)
        .get('/api/account/balance')
        .set('Authorization', `Bearer ${ALICE_TOKEN}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('GET /api/account/balance returns XD balance, referral, currency, usage', async () => {
      bwmClient.request.mockResolvedValue({
        data: {
          xd_balance: 500,
          referral_balance: 25,
          currency: { code: 'KES', rate: 1 },
          usage: { calls_today: 42 },
        },
      });

      const res = await request(app)
        .get('/api/account/balance')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.xd_balance).toBe(500);
      expect(res.body.data.referral_balance).toBe(25);
      expect(res.body.data.currency).toEqual({ code: 'KES', rate: 1 });
      expect(res.body.data.usage).toEqual({ calls_today: 42 });
    });

    it('GET /api/account/orders returns up to 200 API calls with timestamps and XD charges', async () => {
      bwmClient.request.mockResolvedValue({
        data: {
          orders: [
            {
              id: 'call-1',
              endpoint: '/bots/deploy',
              charged_xd: 15,
              timestamp: '2026-11-18T10:00:00Z',
            },
          ],
        },
      });

      const res = await request(app)
        .get('/api/account/orders')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.data.orders).toHaveLength(1);
      expect(res.body.data.orders[0].charged_xd).toBe(15);
      expect(res.body.data.orders[0].timestamp).toBe('2026-11-18T10:00:00Z');
    });
  });

  describe('Bot Pricing, Templates & Deployment Validation', () => {
    it('GET /api/bots/pricing returns live pricing', async () => {
      bwmClient.request.mockResolvedValue({
        data: [
          { days: 7, xd: 5 },
          { days: 30, xd: 15 },
        ],
      });

      const res = await request(app)
        .get('/api/bots/pricing')
        .set('Authorization', `Bearer ${ALICE_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('GET /api/bots/templates returns available templates', async () => {
      bwmClient.request.mockResolvedValue({
        data: [{ id: ALICE_BOT.template_id, name: 'BWM XMD Standard' }],
      });

      const res = await request(app)
        .get('/api/bots/templates')
        .set('Authorization', `Bearer ${ALICE_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.data[0].name).toBe('BWM XMD Standard');
    });

    it('rejects invalid app_name, missing session_id, and invalid template_id', async () => {
      const res = await request(app)
        .post('/api/bots/deploy')
        .set('Authorization', `Bearer ${ALICE_TOKEN}`)
        .send({
          app_name: 'INVALID_NAME!',
          session_id: '',
          days: 30,
          template_id: 'not-a-uuid',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects days that do not match live BWM pricing tiers', async () => {
      bwmClient.request.mockResolvedValueOnce({
        data: [{ days: 7, xd: 5 }, { days: 30, xd: 15 }],
      });

      const res = await request(app)
        .post('/api/bots/deploy')
        .set('Authorization', `Bearer ${ALICE_TOKEN}`)
        .send({
          app_name: 'valid-app-1',
          session_id: 'bwm-session-secret',
          days: 99,
          template_id: ALICE_BOT.template_id,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PRICING_TIER');
    });

    it('deploys bot successfully and records ownership + billing', async () => {
      bwmClient.request
        .mockResolvedValueOnce({ data: [{ days: 30, xd: 15 }] }) // live pricing
        .mockResolvedValueOnce({
          data: {
            id: 'bwm-bot-new',
            app_name: 'valid-app-1',
            status: 'deploying',
            expires_at: ALICE_BOT.expires_at,
            charged_xd: 15,
            balance_after: 485,
          },
        });

      botModel.createBot.mockResolvedValue({
        ...ALICE_BOT,
        bwm_bot_id: 'bwm-bot-new',
        app_name: 'valid-app-1',
      });

      const res = await request(app)
        .post('/api/bots/deploy')
        .set('Authorization', `Bearer ${ALICE_TOKEN}`)
        .send({
          app_name: 'valid-app-1',
          session_id: 'bwm-session-secret',
          days: 30,
          custom_name: 'My Bot',
          template_id: ALICE_BOT.template_id,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.billing.charged_xd).toBe(15);
      expect(res.body.data.billing.balance_after).toBe(485);
      expect(botModel.createBot).toHaveBeenCalledTimes(1);
      expect(transactionModel.createTransaction).toHaveBeenCalledTimes(1);
    });

    it('handles HTTP 402 Insufficient XD balance during deployment', async () => {
      bwmClient.request
        .mockResolvedValueOnce({ data: [{ days: 30, xd: 15 }] })
        .mockRejectedValueOnce(
          new InsufficientBalanceError('Insufficient XD balance', {}, 'BWM_INSUFFICIENT_BALANCE')
        );

      const res = await request(app)
        .post('/api/bots/deploy')
        .set('Authorization', `Bearer ${ALICE_TOKEN}`)
        .send({
          app_name: 'valid-app-2',
          session_id: 'bwm-session-secret',
          days: 30,
        });

      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe('BWM_INSUFFICIENT_BALANCE');
      expect(orderModel.updateOrder).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ status: 'failed' })
      );
    });

    it('records uncertain paid operation when deployment times out', async () => {
      bwmClient.request
        .mockResolvedValueOnce({ data: [{ days: 30, xd: 15 }] })
        .mockRejectedValueOnce(new UncertainOperationError('Timeout during deploy', { reason: 'ECONNABORTED' }));

      const res = await request(app)
        .post('/api/bots/deploy')
        .set('Authorization', `Bearer ${ALICE_TOKEN}`)
        .send({
          app_name: 'valid-app-3',
          session_id: 'bwm-session-secret',
          days: 30,
        });

      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('UNCERTAIN_PAID_OPERATION');
      expect(orderModel.updateOrder).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ status: 'uncertain' })
      );
      expect(transactionModel.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'uncertain' })
      );
    });
  });

  describe('Bot Ownership, Lifecycle, Logs, Vars & Recovery', () => {
    it('prevents Customer B from accessing Customer A bot (403 Forbidden)', async () => {
      botModel.findByIdOrBwmId.mockResolvedValue(ALICE_BOT);

      const res = await request(app)
        .get(`/api/bots/${ALICE_BOT.id}`)
        .set('Authorization', `Bearer ${BOB_TOKEN}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('lists only owned bots for customer with calculated days_remaining', async () => {
      botModel.findByUserId.mockResolvedValue([ALICE_BOT]);

      const res = await request(app)
        .get('/api/bots')
        .set('Authorization', `Bearer ${ALICE_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.data.bots).toHaveLength(1);
      expect(res.body.data.bots[0].days_remaining).toBeGreaterThan(0);
    });

    it('supports start, stop, restart, logs, and vars for bot owner', async () => {
      botModel.findByIdOrBwmId.mockResolvedValue(ALICE_BOT);
      botModel.updateBotById.mockResolvedValue(ALICE_BOT);
      bwmClient.request.mockResolvedValue({ data: { status: 'ok' } });

      const startRes = await request(app)
        .post(`/api/bots/${ALICE_BOT.id}/start`)
        .set('Authorization', `Bearer ${ALICE_TOKEN}`);
      expect(startRes.status).toBe(200);

      const stopRes = await request(app)
        .post(`/api/bots/${ALICE_BOT.id}/stop`)
        .set('Authorization', `Bearer ${ALICE_TOKEN}`);
      expect(stopRes.status).toBe(200);

      const restartRes = await request(app)
        .post(`/api/bots/${ALICE_BOT.id}/restart`)
        .set('Authorization', `Bearer ${ALICE_TOKEN}`);
      expect(restartRes.status).toBe(200);

      const logsRes = await request(app)
        .get(`/api/bots/${ALICE_BOT.id}/logs`)
        .set('Authorization', `Bearer ${ALICE_TOKEN}`);
      expect(logsRes.status).toBe(200);

      const varsGetRes = await request(app)
        .get(`/api/bots/${ALICE_BOT.id}/vars`)
        .set('Authorization', `Bearer ${ALICE_TOKEN}`);
      expect(varsGetRes.status).toBe(200);

      const varsPutRes = await request(app)
        .put(`/api/bots/${ALICE_BOT.id}/vars`)
        .set('Authorization', `Bearer ${ALICE_TOKEN}`)
        .send({ env_vars: { PREFIX: '.', MODE: 'public' } });
      expect(varsPutRes.status).toBe(200);
    });

    it('validates env_vars as a non-empty object', async () => {
      botModel.findByIdOrBwmId.mockResolvedValue(ALICE_BOT);

      const res = await request(app)
        .put(`/api/bots/${ALICE_BOT.id}/vars`)
        .set('Authorization', `Bearer ${ALICE_TOKEN}`)
        .send({ env_vars: ['invalid', 'array'] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ENV_VARS');
    });

    it('extends bot lifetime using valid pricing tier', async () => {
      botModel.findByIdOrBwmId.mockResolvedValue(ALICE_BOT);
      botModel.updateBotById.mockResolvedValue(ALICE_BOT);
      bwmClient.request
        .mockResolvedValueOnce({ data: [{ days: 30, xd: 15 }] })
        .mockResolvedValueOnce({
          data: {
            expires_at: '2026-12-30T00:00:00.000Z',
            charged_xd: 15,
            balance_after: 470,
          },
        });

      const res = await request(app)
        .post(`/api/bots/${ALICE_BOT.id}/extend`)
        .set('Authorization', `Bearer ${ALICE_TOKEN}`)
        .send({ days: 30 });

      expect(res.status).toBe(200);
      expect(res.body.data.billing.charged_xd).toBe(15);
    });

    it('recovers existing bot via POST /api/bots/recover', async () => {
      bwmClient.request.mockResolvedValue({
        data: {
          id: 'bwm-bot-recovered',
          app_name: 'recovered-app',
          status: 'active',
        },
      });
      botModel.findByBwmBotId.mockResolvedValue(null);
      botModel.createBot.mockResolvedValue({
        ...ALICE_BOT,
        bwm_bot_id: 'bwm-bot-recovered',
        app_name: 'recovered-app',
      });

      const res = await request(app)
        .post('/api/bots/recover')
        .set('Authorization', `Bearer ${ALICE_TOKEN}`)
        .send({ app_name: 'recovered-app' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('requires authorized recovery workflow to delete a bot', async () => {
      botModel.findByIdOrBwmId.mockResolvedValue(ALICE_BOT);

      const denied = await request(app)
        .delete(`/api/bots/${ALICE_BOT.id}`)
        .set('Authorization', `Bearer ${ALICE_TOKEN}`);
      expect(denied.status).toBe(403);

      bwmClient.request.mockResolvedValue({ data: { deleted: true } });
      botModel.softDeleteBot.mockResolvedValue({ ...ALICE_BOT, status: 'deleted' });

      const allowed = await request(app)
        .delete(`/api/bots/${ALICE_BOT.id}`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ recovery_authorized: true, reason: 'Customer recovery request' });
      expect(allowed.status).toBe(200);
      expect(botModel.softDeleteBot).toHaveBeenCalledWith(ALICE_BOT.id);
    });
  });

  describe('Panel Servers & Currency APIs', () => {
    it('GET /api/panels/plans returns live panel plans', async () => {
      bwmClient.request.mockResolvedValue({
        data: {
          billing_currency: 'XD',
          plans: [{ id: 's-5g', name: 'Starter 5GB', ram: '5GB', price_xd: 50 }],
        },
      });

      const res = await request(app)
        .get('/api/panels/plans')
        .set('Authorization', `Bearer ${ALICE_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.data.plans).toHaveLength(1);
    });

    it('POST /api/panels/provision validates plan and saves server record', async () => {
      bwmClient.request
        .mockResolvedValueOnce({
          data: { plans: [{ id: 's-5g', name: 'Starter 5GB', price_xd: 50 }] },
        })
        .mockResolvedValueOnce({
          data: {
            id: 'panel-100',
            panel_url: 'https://panel.example.com',
            username: 'alice_panel',
            charged_xd: 50,
            balance_after: 450,
          },
        });

      panelServerModel.createPanelServer.mockResolvedValue({
        id: 'srv-1',
        user_id: CUSTOMER_A.id,
        plan_id: 's-5g',
        username: 'alice_panel',
        panel_url: 'https://panel.example.com',
        status: 'active',
      });

      const res = await request(app)
        .post('/api/panels/provision')
        .set('Authorization', `Bearer ${ALICE_TOKEN}`)
        .send({ username: 'alice_panel', password: 'strongPassword1', plan: 's-5g' });

      expect(res.status).toBe(201);
      expect(res.body.data.server.plan_id).toBe('s-5g');
      expect(res.body.data.billing.charged_xd).toBe(50);
    });

    it('records uncertain order when panel provisioning times out', async () => {
      bwmClient.request
        .mockResolvedValueOnce({
          data: { plans: [{ id: 's-5g', name: 'Starter 5GB', price_xd: 50 }] },
        })
        .mockRejectedValueOnce(new UncertainOperationError('Timeout during provision'));

      const res = await request(app)
        .post('/api/panels/provision')
        .set('Authorization', `Bearer ${ALICE_TOKEN}`)
        .send({ username: 'alice_panel', password: 'strongPassword1', plan: 's-5g' });

      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('UNCERTAIN_PAID_OPERATION');
    });

    it('GET /api/currency/rates and POST /api/currency/convert work with validation', async () => {
      bwmClient.request
        .mockResolvedValueOnce({
          data: {
            currencies: [{ currency: 'KES', symbol: 'KSH', xd_per_unit: 0.72 }],
          },
        })
        .mockResolvedValueOnce({
          data: { amount: 50, from: 'XD', to: 'KES', result: 69.5 },
        });

      const ratesRes = await request(app)
        .get('/api/currency/rates')
        .set('Authorization', `Bearer ${ALICE_TOKEN}`);
      expect(ratesRes.status).toBe(200);

      const badConvert = await request(app)
        .post('/api/currency/convert')
        .set('Authorization', `Bearer ${ALICE_TOKEN}`)
        .send({ amount: -10, from: 'XD', to: 'KES' });
      expect(badConvert.status).toBe(400);

      const convertRes = await request(app)
        .post('/api/currency/convert')
        .set('Authorization', `Bearer ${ALICE_TOKEN}`)
        .send({ amount: 50, from: 'XD', to: 'KES' });
      expect(convertRes.status).toBe(200);
      expect(convertRes.body.data.result).toBe(69.5);
    });
  });
});

