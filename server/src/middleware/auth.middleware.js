const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const userModel = require('../models/user.model');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new UnauthorizedError('Missing or invalid Authorization header'));
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return next(new UnauthorizedError('Authentication token is required'));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.jwt.secret);
    } catch (err) {
      return next(new UnauthorizedError('Invalid or expired authentication token'));
    }

    const user = await userModel.findById(decoded.sub);
    if (!user) {
      return next(new UnauthorizedError('User account no longer exists'));
    }
    if (!user.is_active) {
      return next(new ForbiddenError('User account is disabled'));
    }

    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  authenticate,
};

