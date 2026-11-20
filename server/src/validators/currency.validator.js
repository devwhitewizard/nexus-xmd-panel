const { BadRequestError } = require('../utils/errors');

const CURRENCY_CODE_REGEX = /^[A-Z]{2,10}$/;

function validateConvertCurrency(req, res, next) {
  const { amount, from, to } = req.body || {};
  const errors = [];

  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    errors.push('amount must be a positive number');
  }

  const fromCode = typeof from === 'string' ? from.trim().toUpperCase() : '';
  const toCode = typeof to === 'string' ? to.trim().toUpperCase() : '';

  if (!CURRENCY_CODE_REGEX.test(fromCode)) {
    errors.push('from currency code must be 2-10 uppercase letters (e.g. XD, KES, USD)');
  }
  if (!CURRENCY_CODE_REGEX.test(toCode)) {
    errors.push('to currency code must be 2-10 uppercase letters (e.g. KES, USD, GHS)');
  }

  if (errors.length > 0) {
    return next(new BadRequestError('Validation failed', { errors }, 'VALIDATION_ERROR'));
  }

  req.validatedBody = {
    amount: parsedAmount,
    from: fromCode,
    to: toCode,
  };
  return next();
}

module.exports = {
  validateConvertCurrency,
};

