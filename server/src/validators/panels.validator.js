const { BadRequestError } = require('../utils/errors');
const bwmPanelsService = require('../services/bwm/panels.service');

const PANEL_USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;

function extractPlanIds(plansPayload) {
  const list = Array.isArray(plansPayload)
    ? plansPayload
    : Array.isArray(plansPayload?.plans)
      ? plansPayload.plans
      : [];
  return list
    .map((item) => item?.id || item?.plan)
    .filter((id) => typeof id === 'string' && id.length > 0);
}

async function validateProvisionPanel(req, res, next) {
  try {
    const { username, password, plan } = req.body || {};
    const errors = [];

    if (typeof username !== 'string' || !PANEL_USERNAME_REGEX.test(username)) {
      errors.push('username must be 3-32 characters (letters, numbers, underscores, hyphens)');
    }
    if (typeof password !== 'string' || password.length < 6) {
      errors.push('password must be at least 6 characters');
    }
    if (typeof plan !== 'string' || plan.trim().length === 0) {
      errors.push('plan is required');
    }

    if (errors.length > 0) {
      return next(new BadRequestError('Validation failed', { errors }, 'VALIDATION_ERROR'));
    }

    const plansData = await bwmPanelsService.getPlans();
    const validPlans = extractPlanIds(plansData);

    if (validPlans.length === 0) {
      return next(
        new BadRequestError(
          'Unable to verify panel plans from BWM catalogue',
          {},
          'PANEL_PLANS_UNAVAILABLE'
        )
      );
    }

    if (!validPlans.includes(plan)) {
      return next(
        new BadRequestError(
          `Invalid panel plan "${plan}". Available plans: ${validPlans.join(', ')}`,
          { available_plans: validPlans },
          'INVALID_PANEL_PLAN'
        )
      );
    }

    req.validatedBody = { username, password, plan };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  validateProvisionPanel,
  extractPlanIds,
};

