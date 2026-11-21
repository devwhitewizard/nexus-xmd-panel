const { BadRequestError } = require('../utils/errors');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateServerIdParam(req, res, next) {
  if (!UUID_REGEX.test(String(req.params.id || ''))) {
    return next(new BadRequestError('Invalid server ID format', {}, 'INVALID_ID'));
  }
  return next();
}

function validateListServersQuery(req, res, next) {
  const { status, provider_key, limit, offset } = req.query || {};
  const parsedLimit = limit !== undefined ? Number(limit) : 20;
  const parsedOffset = offset !== undefined ? Number(offset) : 0;

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    return next(new BadRequestError('limit must be an integer between 1 and 100', {}, 'VALIDATION_ERROR'));
  }
  if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
    return next(new BadRequestError('offset must be a non-negative integer', {}, 'VALIDATION_ERROR'));
  }
  if (provider_key !== undefined && provider_key !== 'pterodactyl' && provider_key !== 'bwm-xmd') {
    return next(new BadRequestError('Invalid provider_key filter', {}, 'VALIDATION_ERROR'));
  }

  req.validatedQuery = {
    status: typeof status === 'string' && status.trim() ? status.trim() : null,
    provider_key: provider_key || null,
    limit: parsedLimit,
    offset: parsedOffset,
  };
  return next();
}

module.exports = {
  validateServerIdParam,
  validateListServersQuery,
};

