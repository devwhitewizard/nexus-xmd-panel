const { AppError } = require('../../utils/errors');

/**
 * Modular placeholder for future BWM Ghana Data Services API integration.
 */
function notConfigured(methodName) {
  throw new AppError(
    `Ghana Data (${methodName}) is awaiting official BWM API documentation`,
    501,
    'MODULE_NOT_CONFIGURED'
  );
}

module.exports = {
  getBundles: async () => notConfigured('getBundles'),
  purchaseBundle: async () => notConfigured('purchaseBundle'),
  getPurchaseStatus: async () => notConfigured('getPurchaseStatus'),
};

