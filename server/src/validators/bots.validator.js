const { BadRequestError } = require('../utils/errors');
const bwmBotsService = require('../services/bwm/bots.service');

const APP_NAME_REGEX = /^[a-z0-9-]{3,40}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extract valid day tiers dynamically from BWM pricing response.
 * Supports array of tiers, nested `tiers`/`plans`/`pricing` arrays, or keyed objects.
 */
function extractAvailableDays(pricingData) {
  const daysSet = new Set();

  const inspectList = (list) => {
    for (const item of list) {
      if (typeof item === 'number' && Number.isInteger(item) && item > 0) {
        daysSet.add(item);
      } else if (isPlainObject(item)) {
        const candidate = item.days ?? item.duration_days ?? item.duration ?? item.tier;
        const parsed = Number(candidate);
        if (Number.isInteger(parsed) && parsed > 0) {
          daysSet.add(parsed);
        }
      }
    }
  };

  if (Array.isArray(pricingData)) {
    inspectList(pricingData);
  } else if (isPlainObject(pricingData)) {
    for (const key of ['tiers', 'plans', 'pricing', 'durations', 'packages']) {
      if (Array.isArray(pricingData[key])) {
        inspectList(pricingData[key]);
      }
    }
    if (daysSet.size === 0) {
      for (const [key, val] of Object.entries(pricingData)) {
        const keyNum = Number(key);
        if (Number.isInteger(keyNum) && keyNum > 0) {
          daysSet.add(keyNum);
        } else if (isPlainObject(val)) {
          const candidate = val.days ?? val.duration_days;
          const parsed = Number(candidate);
          if (Number.isInteger(parsed) && parsed > 0) {
            daysSet.add(parsed);
          }
        }
      }
    }
  }

  return Array.from(daysSet).sort((a, b) => a - b);
}

async function validateDaysAgainstLivePricing(days) {
  const parsedDays = Number(days);
  if (!Number.isInteger(parsedDays) || parsedDays <= 0) {
    throw new BadRequestError('days must be a positive integer', {}, 'INVALID_DAYS');
  }

  const pricing = await bwmBotsService.getPricing();
  const availableDays = extractAvailableDays(pricing);

  if (availableDays.length === 0) {
    throw new BadRequestError(
      'Unable to verify pricing tiers from BWM pricing catalogue',
      {},
      'PRICING_TIERS_UNAVAILABLE'
    );
  }

  if (!availableDays.includes(parsedDays)) {
    throw new BadRequestError(
      `Invalid days tier: ${parsedDays}. Available tiers: ${availableDays.join(', ')}`,
      { available_days: availableDays },
      'INVALID_PRICING_TIER'
    );
  }

  return parsedDays;
}

async function validateDeployBot(req, res, next) {
  try {
    const { app_name, session_id, days, custom_name, template_id } = req.body || {};
    const errors = [];

    if (typeof app_name !== 'string' || !APP_NAME_REGEX.test(app_name)) {
      errors.push('app_name must be 3-40 characters of lowercase letters, numbers, and hyphens only');
    }

    if (typeof session_id !== 'string' || session_id.trim().length === 0) {
      errors.push('session_id is required');
    }

    if (template_id !== undefined && template_id !== null && template_id !== '') {
      if (typeof template_id !== 'string' || !UUID_REGEX.test(template_id)) {
        errors.push('template_id must be a valid UUID when supplied');
      }
    }

    if (custom_name !== undefined && custom_name !== null) {
      if (typeof custom_name !== 'string' || custom_name.length > 100) {
        errors.push('custom_name must be a string of at most 100 characters');
      }
    }

    if (days === undefined || days === null) {
      errors.push('days is required');
    }

    if (errors.length > 0) {
      return next(new BadRequestError('Validation failed', { errors }, 'VALIDATION_ERROR'));
    }

    const validDays = await validateDaysAgainstLivePricing(days);

    req.validatedBody = {
      app_name,
      session_id,
      days: validDays,
      ...(custom_name ? { custom_name } : {}),
      ...(template_id ? { template_id } : {}),
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

async function validateExtendBot(req, res, next) {
  try {
    const { days } = req.body || {};
    if (days === undefined || days === null) {
      return next(new BadRequestError('days is required', {}, 'VALIDATION_ERROR'));
    }

    const validDays = await validateDaysAgainstLivePricing(days);
    req.validatedBody = { days: validDays };
    return next();
  } catch (err) {
    return next(err);
  }
}

function validateRecoverBot(req, res, next) {
  const { app_name, session_id, bot_id, custom_name } = req.body || {};
  const errors = [];

  if (app_name !== undefined && (typeof app_name !== 'string' || !APP_NAME_REGEX.test(app_name))) {
    errors.push('app_name must be 3-40 characters of lowercase letters, numbers, and hyphens');
  }
  if (!app_name && !bot_id && !session_id) {
    errors.push('At least one of app_name, bot_id, or session_id is required for recovery');
  }
  if (session_id !== undefined && typeof session_id !== 'string') {
    errors.push('session_id must be a string');
  }
  if (custom_name !== undefined && typeof custom_name !== 'string') {
    errors.push('custom_name must be a string');
  }

  if (errors.length > 0) {
    return next(new BadRequestError('Validation failed', { errors }, 'VALIDATION_ERROR'));
  }

  req.validatedBody = {
    ...(app_name ? { app_name } : {}),
    ...(bot_id ? { bot_id } : {}),
    ...(session_id ? { session_id } : {}),
    ...(custom_name ? { custom_name } : {}),
  };
  return next();
}

function validateUpdateVars(req, res, next) {
  const body = req.body || {};
  const envVars = body.env_vars !== undefined ? body.env_vars : body;

  if (!isPlainObject(envVars) || Object.keys(envVars).length === 0) {
    return next(
      new BadRequestError(
        'env_vars must be a non-empty JSON object of key/value pairs',
        {},
        'INVALID_ENV_VARS'
      )
    );
  }

  for (const [key, val] of Object.entries(envVars)) {
    if (typeof key !== 'string' || key.trim().length === 0) {
      return next(new BadRequestError('Environment variable names must be non-empty strings', {}, 'INVALID_ENV_VARS'));
    }
    if (val !== null && typeof val === 'object') {
      return next(
        new BadRequestError(`Environment variable "${key}" must be a primitive value`, {}, 'INVALID_ENV_VARS')
      );
    }
  }

  req.validatedBody = { env_vars: envVars };
  return next();
}

module.exports = {
  APP_NAME_REGEX,
  UUID_REGEX,
  extractAvailableDays,
  validateDeployBot,
  validateExtendBot,
  validateRecoverBot,
  validateUpdateVars,
};

