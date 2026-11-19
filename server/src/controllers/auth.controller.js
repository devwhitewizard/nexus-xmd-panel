const authService = require('../services/auth.service');
const { sendSuccess } = require('../utils/apiResponse');

function getReqMeta(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
  };
}

async function register(req, res, next) {
  try {
    const result = await authService.register(req.validatedBody, getReqMeta(req));
    return sendSuccess(res, {
      statusCode: 201,
      message: 'Account registered successfully',
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.login(req.validatedBody, getReqMeta(req));
    return sendSuccess(res, {
      statusCode: 200,
      message: 'Login successful',
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await authService.getProfile(req.user.id);
    return sendSuccess(res, {
      statusCode: 200,
      message: 'Profile retrieved successfully',
      data: { user },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  register,
  login,
  me,
};

