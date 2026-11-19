const { AppError } = require('../../utils/errors');

/**
 * Modular placeholder for future BWM Currency Conversion & Pricing API integration.
 */
function notConfigured(methodName) {
  throw new AppError(
    `Currency Service (${methodName}) is awaiting official BWM API documentation`,
    501,
    'MODULE_NOT_CONFIGURED'
  );
}

module.exports = {
  getExchangeRates: async () => notConfigured('getExchangeRates'),
  convertPrice: async () => notConfigured('convertPrice'),
};

