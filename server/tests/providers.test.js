jest.mock('../src/services/bwm/bwm.client');

const bwmClient = require('../src/services/bwm/bwm.client');
const { providerManager } = require('../src/providers/providerManager');
const { AppError, NotFoundError } = require('../src/utils/errors');

describe('Phase 2 — Multi-Provider Foundation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists registered providers with explicit capabilities', () => {
    const providers = providerManager.listProviders();
    expect(providers).toHaveLength(2);

    const bwm = providers.find((p) => p.key === 'bwm-xmd');
    const ptero = providers.find((p) => p.key === 'pterodactyl');

    expect(bwm).toBeDefined();
    expect(bwm.requires_connection_config).toBe(false);
    expect(bwm.capabilities).toEqual({
      testConnection: true,
      discoverResources: true,
      provisionServer: true,
      getServerDetails: false,
      setPowerState: false,
      getServerResources: false,
    });

    expect(ptero).toBeDefined();
    expect(ptero.requires_connection_config).toBe(true);
    expect(ptero.capabilities).toEqual({
      testConnection: true,
      discoverResources: true,
      provisionServer: true,
      getServerDetails: true,
      setPowerState: true,
      getServerResources: true,
    });
  });

  it('throws NotFoundError for unregistered provider keys', () => {
    expect(() => providerManager.getProvider('unknown-provider')).toThrow(NotFoundError);
  });

  it('BWM XMD provider rejects unsupported capabilities without simulating them', async () => {
    const bwm = providerManager.getProvider('bwm-xmd');

    await expect(bwm.getServerDetails('srv-1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'UNSUPPORTED_PROVIDER_CAPABILITY',
    });
    await expect(bwm.setPowerState('srv-1', 'start')).rejects.toMatchObject({
      statusCode: 501,
      code: 'UNSUPPORTED_PROVIDER_CAPABILITY',
    });
    await expect(bwm.getServerResources('srv-1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'UNSUPPORTED_PROVIDER_CAPABILITY',
    });
  });

  it('BWM XMD provider tests connection and discovers live plans', async () => {
    bwmClient.request.mockResolvedValue({
      data: {
        plans: [{ id: 's-5g', name: 'Starter 5GB', price_xd: 50 }],
      },
    });

    const bwm = providerManager.getProvider('bwm-xmd');
    const testRes = await bwm.testConnection();
    expect(testRes).toEqual({
      connected: true,
      provider: 'bwm-xmd',
      available_plans: 1,
    });

    const resources = await bwm.discoverResources();
    expect(resources.plans).toHaveLength(1);
    expect(resources.plans[0].id).toBe('s-5g');
  });

  it('Pterodactyl foundation reports pending implementation cleanly for upcoming phases', async () => {
    const ptero = providerManager.getProvider('pterodactyl');
    await expect(ptero.provisionServer()).rejects.toBeInstanceOf(AppError);
    await expect(ptero.provisionServer()).rejects.toMatchObject({
      statusCode: 501,
      code: 'PTERODACTYL_PHASE_PENDING',
    });
  });
});

