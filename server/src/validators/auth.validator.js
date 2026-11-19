const { BadRequestError } = require('../utils/errors');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;

function validateRegister(req, res, next) {
  const { email, username, password } = req.body || {};
  const errors = [];

  if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    errors.push('Valid email is required');
  }
  if (typeof username !== 'string' || !USERNAME_REGEX.test(username)) {
    errors.push('Username must be 3-32 characters (letters, numbers, underscores, hyphens)');
  }
  if (typeof password !== 'string' || password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (errors.length > 0) {
    return next(new BadRequestError('Validation failed', { errors }, 'VALIDATION_ERROR'));
  }

  // Mass-assignment protection: only pass allowed fields forward
  req.validatedBody = {
    email: email.toLowerCase(),
    username,
    password,
  };
  return next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body || {};
  const errors = [];

  if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    errors.push('Valid email is required');
  }
  if (typeof password !== 'string' || password.length === 0) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return next(new BadRequestError('Validation failed', { errors }, 'VALIDATION_ERROR'));
  }

  req.validatedBody = {
    email: email.toLowerCase(),
    password,
  };
  return next();
}

module.exports = {
  validateRegister,
  validateLogin,
};

