const { AppError } = require('../../utils/errors');

/**
 * Modular placeholder for future BWM Panel Servers API integration.
 * Do not add undocumented endpoints or billing assumptions.
 */
function notConfigured(methodName) {
  throw new AppError(
    `Panel Servers (${methodName}) is awaiting official BWM API documentation`,
    501,
    'MODULE_NOT_CONFIGURED'
  );
}

module.exports = {
  provisionPanel: async () => notConfigured('provisionPanel'),
  listPanels: async () => notConfigured('listPanels'),
  getPanel: async () => notConfigured('getPanel'),
  managePanel: async () => notConfigured('managePanel'),
};

