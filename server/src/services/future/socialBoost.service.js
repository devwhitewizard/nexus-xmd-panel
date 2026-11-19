const { AppError } = require('../../utils/errors');

/**
 * Modular placeholder for future BWM Social Media Boosting API integration.
 * Do not add endpoint paths or parameters until official BWM documentation is provided.
 */
function notConfigured(methodName) {
  throw new AppError(
    `Social Media Boosting (${methodName}) is awaiting official BWM API documentation`,
    501,
    'MODULE_NOT_CONFIGURED'
  );
}

module.exports = {
  getServiceCatalogue: async () => notConfigured('getServiceCatalogue'),
  getServicePricing: async () => notConfigured('getServicePricing'),
  createOrder: async () => notConfigured('createOrder'),
  getOrderStatus: async () => notConfigured('getOrderStatus'),
  getOrderHistory: async () => notConfigured('getOrderHistory'),
};

