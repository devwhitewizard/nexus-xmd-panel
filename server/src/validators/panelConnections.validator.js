const { BadRequestError } = require('../utils/errors');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateConnectionIdParam(req, res, next) {
  const { id } = req.params;
  if (!UUID_REGEX.test(String(id || ''))) {
    return next(new BadRequestError('Invalid connection ID format', {}, 'INVALID_ID'));
  }
  return next();
}

function validateCreateConnection(req, res, next) {
  const { label, panel_url, api_key, description, is_enabled, default_config } = req.body || {};
  const errors = [];

  if (typeof label !== 'string' || label.trim().length < 2 || label.trim().length > 120) {
    errors.push('label must be 2-120 characters');
  }
  if (typeof panel_url !== 'string' || panel_url.trim().length === 0) {
    errors.push('panel_url is required');
  }
  if (typeof api_key !== 'string' || api_key.trim().length < 10) {
    errors.push('api_key (Pterodactyl Application API key) must be at least 10 characters');
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    errors.push('description must be a string');
  }
  if (is_enabled !== undefined && typeof is_enabled !== 'boolean') {
    errors.push('is_enabled must be a boolean');
  }
  if (default_config !== undefined && !isPlainObject(default_config)) {
    errors.push('default_config must be a JSON object');
  }

  if (errors.length > 0) {
    return next(new BadRequestError('Validation failed', { errors }, 'VALIDATION_ERROR'));
  }

  req.validatedBody = {
    label: label.trim(),
    panel_url: panel_url.trim(),
    api_key: api_key.trim(),
    ...(description !== undefined ? { description } : {}),
    ...(is_enabled !== undefined ? { is_enabled } : {}),
    ...(default_config !== undefined ? { default_config } : {}),
  };
  return next();
}

function validateUpdateConnection(req, res, next) {
  const { label, panel_url, api_key, description, is_enabled, default_config } = req.body || {};
  const errors = [];
  const validated = {};

  if (label !== undefined) {
    if (typeof label !== 'string' || label.trim().length < 2 || label.trim().length > 120) {
      errors.push('label must be 2-120 characters');
    } else {
      validated.label = label.trim();
    }
  }
  if (panel_url !== undefined) {
    if (typeof panel_url !== 'string' || panel_url.trim().length === 0) {
      errors.push('panel_url must be a non-empty string');
    } else {
      validated.panel_url = panel_url.trim();
    }
  }
  if (api_key !== undefined) {
    if (typeof api_key !== 'string' || api_key.trim().length < 10) {
      errors.push('api_key must be at least 10 characters');
    } else {
      validated.api_key = api_key.trim();
    }
  }
  if (description !== undefined) {
    if (description !== null && typeof description !== 'string') {
      errors.push('description must be a string or null');
    } else {
      validated.description = description;
    }
  }
  if (is_enabled !== undefined) {
    if (typeof is_enabled !== 'boolean') {
      errors.push('is_enabled must be a boolean');
    } else {
      validated.is_enabled = is_enabled;
    }
  }
  if (default_config !== undefined) {
    if (!isPlainObject(default_config)) {
      errors.push('default_config must be a JSON object');
    } else {
      validated.default_config = default_config;
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

function validateConnectionStatus(req, res, next) {
  const { is_enabled } = req.body || {};
  if (typeof is_enabled !== 'boolean') {
    return next(new BadRequestError('is_enabled must be a boolean', {}, 'VALIDATION_ERROR'));
  }
  req.validatedBody = { is_enabled };
  return next();
}

function validateResourceConfiguration(req, res, next) {
  const body = req.body || {};
  const allowedKeys = ['nest_id', 'egg_id', 'location_id', 'node_id', 'allocation_id'];
  const validated = {};
  const errors = [];

  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const val = body[key];
      if (val === null) {
        validated[key] = null;
      } else if (Number.isInteger(val) && val > 0) {
        validated[key] = val;
      } else {
        errors.push(`${key} must be a positive integer or null to clear`);
      }
    }
  }

  if (errors.length > 0) {
    return next(new BadRequestError('Validation failed', { errors }, 'VALIDATION_ERROR'));
  }

  if (Object.keys(validated).length === 0) {
    return next(
      new BadRequestError(
        'Provide at least one resource override (nest_id, egg_id, location_id, node_id, allocation_id)',
        {},
        'VALIDATION_ERROR'
      )
    );
  }

  req.validatedBody = validated;
  return next();
}

module.exports = {
  validateConnectionIdParam,
  validateCreateConnection,
  validateUpdateConnection,
  validateConnectionStatus,
  validateResourceConfiguration,
};

