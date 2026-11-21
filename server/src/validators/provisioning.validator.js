const { BadRequestError } = require('../utils/errors');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateOrderIdParam(req, res, next) {
  if (!UUID_REGEX.test(String(req.params.orderId || ''))) {
    return next(new BadRequestError('Invalid orderId format', {}, 'INVALID_ID'));
  }
  return next();
}

function validateProvisioningIdParam(req, res, next) {
  if (!UUID_REGEX.test(String(req.params.id || ''))) {
    return next(new BadRequestError('Invalid provisioning ID format', {}, 'INVALID_ID'));
  }
  return next();
}

/**
 * Validate customer provisioning request payload.
 * Intentionally ignores any provider_key, connection_id, or price fields.
 */
function validateProvisionOrderBody(req, res, next) {
  const { server_name, password } = req.body || {};
  const errors = [];

  if (server_name !== undefined && server_name !== null) {
    if (typeof server_name !== 'string' || server_name.trim().length < 2 || server_name.trim().length > 100) {
      errors.push('server_name must be 2-100 characters');
    }
  }

  if (password !== undefined && password !== null) {
    if (typeof password !== 'string' || password.length < 6) {
      errors.push('password must be at least 6 characters');
    }
  }

  if (errors.length > 0) {
    return next(new BadRequestError('Validation failed', { errors }, 'VALIDATION_ERROR'));
  }

  req.validatedBody = {
    ...(server_name ? { server_name: server_name.trim() } : {}),
    ...(password ? { password } : {}),
  };
  return next();
}

module.exports = {
  validateOrderIdParam,
  validateProvisioningIdParam,
  validateProvisionOrderBody,
};

