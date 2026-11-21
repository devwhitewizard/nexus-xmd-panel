const { AppError } = require('../../utils/errors');

const CAPABILITY_KEYS = Object.freeze([
  'testConnection',
  'discoverResources',
  'provisionServer',
  'getServerDetails',
  'setPowerState',
  'getServerResources',
]);

class PanelProvider {
  constructor({ key, name, requiresConnectionConfig = false, capabilities = {} }) {
    this.key = key;
    this.name = name;
    this.requiresConnectionConfig = requiresConnectionConfig;
    this.capabilities = CAPABILITY_KEYS.reduce((acc, cap) => {
      acc[cap] = Boolean(capabilities[cap]);
      return acc;
    }, {});
  }

  supports(capability) {
    return Boolean(this.capabilities[capability]);
  }

  assertSupported(capability) {
    if (!this.supports(capability)) {
      throw new AppError(
        `Provider "${this.name}" does not support "${capability}"`,
        501,
        'UNSUPPORTED_PROVIDER_CAPABILITY',
        { provider: this.key, capability }
      );
    }
  }

  async testConnection() {
    this.assertSupported('testConnection');
    throw new AppError('testConnection not implemented', 501, 'NOT_IMPLEMENTED');
  }

  async discoverResources() {
    this.assertSupported('discoverResources');
    throw new AppError('discoverResources not implemented', 501, 'NOT_IMPLEMENTED');
  }

  async provisionServer() {
    this.assertSupported('provisionServer');
    throw new AppError('provisionServer not implemented', 501, 'NOT_IMPLEMENTED');
  }

  async getServerDetails() {
    this.assertSupported('getServerDetails');
    throw new AppError('getServerDetails not implemented', 501, 'NOT_IMPLEMENTED');
  }

  async setPowerState() {
    this.assertSupported('setPowerState');
    throw new AppError('setPowerState not implemented', 501, 'NOT_IMPLEMENTED');
  }

  async getServerResources() {
    this.assertSupported('getServerResources');
    throw new AppError('getServerResources not implemented', 501, 'NOT_IMPLEMENTED');
  }

  toDescriptor() {
    return {
      key: this.key,
      name: this.name,
      requires_connection_config: this.requiresConnectionConfig,
      capabilities: { ...this.capabilities },
    };
  }
}

module.exports = {
  CAPABILITY_KEYS,
  PanelProvider,
};

