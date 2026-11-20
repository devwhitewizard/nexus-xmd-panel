const bwmCurrencyService = require('../services/bwm/currency.service');
const { sendSuccess } = require('../utils/apiResponse');

async function getRates(req, res, next) {
  try {
    const data = await bwmCurrencyService.getRates();
    return sendSuccess(res, { message: 'Exchange rates retrieved successfully', data });
  } catch (err) {
    return next(err);
  }
}

async function convert(req, res, next) {
  try {
    const data = await bwmCurrencyService.convert(req.validatedBody);
    return sendSuccess(res, { message: 'Currency converted successfully', data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getRates,
  convert,
};

