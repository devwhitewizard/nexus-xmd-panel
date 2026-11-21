const { PanelProvider } = require('../interfaces/panelProvider.interface');
const { AppError } = require('../../utils/errors');
const pterodactylClient = require('./pterodactyl.client');
const pterodactylResources = require('./pterodactyl.resources');

class PterodactylProvider extends PanelProvider {
  constructor() {
    super({
      key: 'pterodactyl',
      name: 'Pterodactyl',
      requiresConnectionConfig: true,
      capabilities: {
        testConnection: true,
        discoverResources: true,
        provisionServer: true,
        getServerDetails: true,
        setPowerState: true,
        getServerResources: true,
      },
    });
  }

  pendingImplementation(operation) {
    throw new AppError(
      `Pterodactyl "${operation}" will be implemented in the upcoming provider phase`,
      501,
      'PTERODACTYL_PHASE_PENDING',
      { provider: this.key, operation }
    );
  }

  async testConnection({ panelUrl, apiKey } = {}) {
    this.assertSupported('testConnection');
    return pterodactylClient.testConnection({ panelUrl, apiKey });
  }

  async discoverResources({ panelUrl, apiKey } = {}) {
    this.assertSupported('discoverResources');
    return pterodactylResources.discoverAll({ panelUrl, apiKey });
  }

  async provisionServer() {
    this.assertSupported('provisionServer');
    return this.pendingImplementation('provisionServer');
  }

  async getServerDetails() {
    this.assertSupported('getServerDetails');
    return this.pendingImplementation('getServerDetails');
  }

  async setPowerState() {
    this.assertSupported('setPowerState');
    return this.pendingImplementation('setPowerState');
  }

  async getServerResources() {
    this.assertSupported('getServerResources');
    return this.pendingImplementation('getServerResources');
  }
}

module.exports = {
  PterodactylProvider,
};
