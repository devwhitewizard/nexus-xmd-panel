const { BadRequestError } = require('../utils/errors');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_REGEX = /^[A-Z]{2,10}$/;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate `:id` route parameter as a UUID.
 */
function validatePackageIdParam(req, res, next) {
  if (!UUID_REGEX.test(String(req.params.id || ''))) {
    return next(new BadRequestError('Invalid package ID format', {}, 'INVALID_ID'));
  }
  return next();
}

function validateNonNegativeInt(value, field, errors, min = 0, max = 10000000) {
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push(`${field} must be an integer between ${min} and ${max}`);
  }
}

function validateOptionalPositiveInt(value, field, errors) {
  if (value !== undefined && value !== null) {
    if (!Number.isInteger(value) || value <= 0) {
      errors.push(`${field} must be a positive integer or null`);
    }
  }
}

function validateEggEnvironment(envObj, errors) {
  if (!isPlainObject(envObj)) {
    errors.push('egg_environment must be a JSON object');
    return;
  }
  for (const [k, v] of Object.entries(envObj)) {
    if (typeof k !== 'string' || k.trim().length === 0) {
      errors.push('egg_environment keys must be non-empty strings');
    }
    if (v !== null && typeof v === 'object') {
      errors.push(`egg_environment["${k}"] must be a primitive value`);
    }
  }
}

/**
 * Validate admin package creation payload with mass-assignment protection.
 */
function validateCreatePackage(req, res, next) {
  const b = req.body || {};
  const errors = [];

  if (typeof b.name !== 'string' || b.name.trim().length < 2 || b.name.trim().length > 120) {
    errors.push('name must be 2-120 characters');
  }
  if (b.description !== undefined && b.description !== null && typeof b.description !== 'string') {
    errors.push('description must be a string');
  }

  const parsedPrice = Number(b.price);
  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
    errors.push('price must be a non-negative number');
  }

  const currency = typeof b.currency === 'string' ? b.currency.trim().toUpperCase() : 'XD';
  if (!CURRENCY_REGEX.test(currency)) {
    errors.push('currency must be 2-10 uppercase letters');
  }

  if (b.provider_key !== 'pterodactyl' && b.provider_key !== 'bwm-xmd') {
    errors.push('provider_key must be either "pterodactyl" or "bwm-xmd"');
  }

  if (b.connection_id !== undefined && b.connection_id !== null) {
    if (!UUID_REGEX.test(String(b.connection_id))) {
      errors.push('connection_id must be a valid UUID');
    }
  }

  if (b.bwm_plan_id !== undefined && b.bwm_plan_id !== null && typeof b.bwm_plan_id !== 'string') {
    errors.push('bwm_plan_id must be a string');
  }

  if (b.memory_mb !== undefined) validateNonNegativeInt(b.memory_mb, 'memory_mb', errors, 0);
  if (b.disk_mb !== undefined) validateNonNegativeInt(b.disk_mb, 'disk_mb', errors, 0);
  if (b.cpu_percent !== undefined) validateNonNegativeInt(b.cpu_percent, 'cpu_percent', errors, 0);
  if (b.swap_mb !== undefined) validateNonNegativeInt(b.swap_mb, 'swap_mb', errors, 0);
  if (b.io_weight !== undefined) validateNonNegativeInt(b.io_weight, 'io_weight', errors, 10, 1000);
  if (b.database_limit !== undefined) validateNonNegativeInt(b.database_limit, 'database_limit', errors, 0);
  if (b.backup_limit !== undefined) validateNonNegativeInt(b.backup_limit, 'backup_limit', errors, 0);
  if (b.allocation_limit !== undefined) validateNonNegativeInt(b.allocation_limit, 'allocation_limit', errors, 1);

  validateOptionalPositiveInt(b.nest_id, 'nest_id', errors);
  validateOptionalPositiveInt(b.egg_id, 'egg_id', errors);
  validateOptionalPositiveInt(b.location_id, 'location_id', errors);
  validateOptionalPositiveInt(b.node_id, 'node_id', errors);
  validateOptionalPositiveInt(b.allocation_id, 'allocation_id', errors);

  if (b.egg_environment !== undefined) validateEggEnvironment(b.egg_environment, errors);
  if (b.is_enabled !== undefined && typeof b.is_enabled !== 'boolean') {
    errors.push('is_enabled must be a boolean');
  }

  if (errors.length > 0) {
    return next(new BadRequestError('Validation failed', { errors }, 'VALIDATION_ERROR'));
  }

  req.validatedBody = {
    name: b.name.trim(),
    description: b.description ?? null,
    price: parsedPrice,
    currency,
    provider_key: b.provider_key,
    connection_id: b.connection_id ?? null,
    bwm_plan_id: b.bwm_plan_id ?? null,
    memory_mb: b.memory_mb ?? 512,
    disk_mb: b.disk_mb ?? 1024,
    cpu_percent: b.cpu_percent ?? 100,
    swap_mb: b.swap_mb ?? 0,
    io_weight: b.io_weight ?? 500,
    database_limit: b.database_limit ?? 0,
    backup_limit: b.backup_limit ?? 0,
    allocation_limit: b.allocation_limit ?? 1,
    nest_id: b.nest_id ?? null,
    egg_id: b.egg_id ?? null,
    location_id: b.location_id ?? null,
    node_id: b.node_id ?? null,
    allocation_id: b.allocation_id ?? null,
    egg_environment: b.egg_environment ?? {},
    is_enabled: b.is_enabled ?? true,
  };
  return next();
}

/**
 * Validate admin package update payload.
 */
function validateUpdatePackage(req, res, next) {
  const b = req.body || {};
  const errors = [];
  const validated = {};

  if (b.name !== undefined) {
    if (typeof b.name !== 'string' || b.name.trim().length < 2 || b.name.trim().length > 120) {
      errors.push('name must be 2-120 characters');
    } else {
      validated.name = b.name.trim();
    }
  }
  if (b.description !== undefined) {
    if (b.description !== null && typeof b.description !== 'string') {
      errors.push('description must be a string or null');
    } else {
      validated.description = b.description;
    }
  }
  if (b.price !== undefined) {
    const parsedPrice = Number(b.price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      errors.push('price must be a non-negative number');
    } else {
      validated.price = parsedPrice;
    }
  }
  if (b.currency !== undefined) {
    const currency = typeof b.currency === 'string' ? b.currency.trim().toUpperCase() : '';
    if (!CURRENCY_REGEX.test(currency)) {
      errors.push('currency must be 2-10 uppercase letters');
    } else {
      validated.currency = currency;
    }
  }
  if (b.provider_key !== undefined) {
    if (b.provider_key !== 'pterodactyl' && b.provider_key !== 'bwm-xmd') {
      errors.push('provider_key must be either "pterodactyl" or "bwm-xmd"');
    } else {
      validated.provider_key = b.provider_key;
    }
  }
  if (b.connection_id !== undefined) {
    if (b.connection_id !== null && !UUID_REGEX.test(String(b.connection_id))) {
      errors.push('connection_id must be a valid UUID or null');
    } else {
      validated.connection_id = b.connection_id;
    }
  }
  if (b.bwm_plan_id !== undefined) {
    if (b.bwm_plan_id !== null && typeof b.bwm_plan_id !== 'string') {
      errors.push('bwm_plan_id must be a string or null');
    } else {
      validated.bwm_plan_id = b.bwm_plan_id;
    }
  }

  for (const [field, min, max] of [
    ['memory_mb', 0, 10000000],
    ['disk_mb', 0, 10000000],
    ['cpu_percent', 0, 100000],
    ['swap_mb', 0, 10000000],
    ['io_weight', 10, 1000],
    ['database_limit', 0, 10000],
    ['backup_limit', 0, 10000],
    ['allocation_limit', 1, 10000],
  ]) {
    if (b[field] !== undefined) {
      validateNonNegativeInt(b[field], field, errors, min, max);
      validated[field] = b[field];
    }
  }

  for (const field of ['nest_id', 'egg_id', 'location_id', 'node_id', 'allocation_id']) {
    if (b[field] !== undefined) {
      validateOptionalPositiveInt(b[field], field, errors);
      validated[field] = b[field];
    }
  }

  if (b.egg_environment !== undefined) {
    validateEggEnvironment(b.egg_environment, errors);
    validated.egg_environment = b.egg_environment;
  }
  if (b.is_enabled !== undefined) {
    if (typeof b.is_enabled !== 'boolean') {
      errors.push('is_enabled must be a boolean');
    } else {
      validated.is_enabled = b.is_enabled;
    }
  }

  if (errors.length > 0) {
    return next(new BadRequestError('Validation failed', { errors }, 'VALIDATION_ERROR'));
  }
  if (Object.keys(validated).length === 0) {
    return next(new BadRequestError('At least one field must be provided for update', {}, 'VALIDATION_ERROR'));
  }

  req.validatedBody = validated;
  return next();
}

/**
 * Validate package enable/disable payload.
 */
function validatePackageStatus(req, res, next) {
  const { is_enabled } = req.body || {};
  if (typeof is_enabled !== 'boolean') {
    return next(new BadRequestError('is_enabled must be a boolean', {}, 'VALIDATION_ERROR'));
  }
  req.validatedBody = { is_enabled };
  return next();
}

module.exports = {
  validatePackageIdParam,
  validateCreatePackage,
  validateUpdatePackage,
  validatePackageStatus,
};

