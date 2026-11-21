const { PanelProvider } = require('../interfaces/panelProvider.interface');
const bwmPanelsService = require('../../services/bwm/panels.service');

class BwmXmdProvider extends PanelProvider {
  constructor() {
    super({
      key: 'bwm-xmd',
      name: 'BWM XMD',
      // Uses server-side BWM_API_KEY configuration directly; does not require a Pterodactyl-style connection row
      requiresConnectionConfig: false,
      capabilities: {
        testConnection: true,
        discoverResources: true,
        provisionServer: true,
        getServerDetails: false,
        setPowerState: false,
        getServerResources: false,
      },
    });
  }

  async testConnection() {
    this.assertSupported('testConnection');
    const plansData = await bwmPanelsService.getPlans();
    const planCount = Array.isArray(plansData?.plans) ? plansData.plans.length : 0;
    return {
      connected: true,
      provider: this.key,
      available_plans: planCount,
    };
  }

  async discoverResources() {
    this.assertSupported('discoverResources');
    const plansData = await bwmPanelsService.getPlans();
    return {
      provider: this.key,
      plans: Array.isArray(plansData?.plans) ? plansData.plans : [],
      raw: plansData,
    };
  }

  async provisionServer({ username, password, plan }) {
    this.assertSupported('provisionServer');
    return bwmPanelsService.provisionPanel({ username, password, plan });
  }
}

module.exports = {
  BwmXmdProvider,
};

