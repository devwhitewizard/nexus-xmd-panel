const { BadRequestError } = require('../utils/errors');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate `:packageId` route parameter as a UUID.
 */
function validatePackageIdRouteParam(req, res, next) {
  if (!UUID_REGEX.test(String(req.params.packageId || ''))) {
    return next(new BadRequestError('Invalid packageId format', {}, 'INVALID_ID'));
  }
  return next();
}

/**
 * Validate admin provider assignment update payload with mass-assignment protection.
 */
function validateAssignProvider(req, res, next) {
  const b = req.body || {};
  const errors = [];

  if (b.provider_key !== 'pterodactyl' && b.provider_key !== 'bwm-xmd') {
    errors.push('provider_key must be either "pterodactyl" or "bwm-xmd"');
  }

  if (b.connection_id !== undefined && b.connection_id !== null) {
    if (!UUID_REGEX.test(String(b.connection_id))) {
      errors.push('connection_id must be a valid UUID or null');
    }
  }

  if (b.bwm_plan_id !== undefined && b.bwm_plan_id !== null && typeof b.bwm_plan_id !== 'string') {
    errors.push('bwm_plan_id must be a string or null');
  }

  for (const field of ['nest_id', 'egg_id', 'location_id', 'node_id', 'allocation_id']) {
    if (b[field] !== undefined && b[field] !== null) {
      if (!Number.isInteger(b[field]) || b[field] <= 0) {
        errors.push(`${field} must be a positive integer or null`);
      }
    }
  }

  if (errors.length > 0) {
    return next(new BadRequestError('Validation failed', { errors }, 'VALIDATION_ERROR'));
  }

  req.validatedBody = {
    provider_key: b.provider_key,
    ...(b.connection_id !== undefined ? { connection_id: b.connection_id } : {}),
    ...(b.bwm_plan_id !== undefined ? { bwm_plan_id: b.bwm_plan_id } : {}),
    ...(b.nest_id !== undefined ? { nest_id: b.nest_id } : {}),
    ...(b.egg_id !== undefined ? { egg_id: b.egg_id } : {}),
    ...(b.location_id !== undefined ? { location_id: b.location_id } : {}),
    ...(b.node_id !== undefined ? { node_id: b.node_id } : {}),
    ...(b.allocation_id !== undefined ? { allocation_id: b.allocation_id } : {}),
  };

  return next();
}

module.exports = {
  validatePackageIdRouteParam,
  validateAssignProvider,
};

