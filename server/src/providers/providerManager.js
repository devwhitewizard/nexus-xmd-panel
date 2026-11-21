const { BadRequestError, NotFoundError } = require('../utils/errors');
const { BwmXmdProvider } = require('./bwm-xmd/bwm.provider');
const { PterodactylProvider } = require('./pterodactyl/pterodactyl.provider');

class ProviderManager {
  constructor() {
    this.registry = new Map();
    this.register(new BwmXmdProvider());
    this.register(new PterodactylProvider());
  }

  register(provider) {
    if (!provider || !provider.key) {
      throw new Error('Provider must define a unique key');
    }
    this.registry.set(provider.key, provider);
  }

  getProvider(providerKey) {
    if (typeof providerKey !== 'string' || !providerKey.trim()) {
      throw new BadRequestError('Provider key is required', {}, 'INVALID_PROVIDER_KEY');
    }
    const provider = this.registry.get(providerKey.trim().toLowerCase());
    if (!provider) {
      throw new NotFoundError(
        `Infrastructure provider "${providerKey}" is not registered`,
        { provider: providerKey },
        'PROVIDER_NOT_FOUND'
      );
    }
    return provider;
  }

  listProviders() {
    return Array.from(this.registry.values()).map((provider) => provider.toDescriptor());
  }

  hasCapability(providerKey, capability) {
    const provider = this.getProvider(providerKey);
    return provider.supports(capability);
  }

  assertCapability(providerKey, capability) {
    const provider = this.getProvider(providerKey);
    provider.assertSupported(capability);
    return provider;
  }
}

const providerManager = new ProviderManager();

module.exports = {
  ProviderManager,
  providerManager,
};

