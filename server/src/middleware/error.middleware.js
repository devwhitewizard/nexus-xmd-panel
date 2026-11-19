const { AppError } = require('../utils/errors');
const { sendError } = require('../utils/apiResponse');
const { logger } = require('../utils/logger');
const { env } = require('../config/env');

function notFoundHandler(req, res) {
  return sendError(res, {
    statusCode: 404,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    code: 'ROUTE_NOT_FOUND',
  });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // Handle malformed JSON body
  if (err.type === 'entity.parse.failed') {
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid JSON payload',
      code: 'INVALID_JSON',
    });
  }

  // Handle payload too large
  if (err.type === 'entity.too.large') {
    return sendError(res, {
      statusCode: 413,
      message: 'Request payload exceeds size limit',
      code: 'PAYLOAD_TOO_LARGE',
    });
  }

  // Handle PostgreSQL unique / foreign key violations cleanly
  if (err.code === '23505') {
    return sendError(res, {
      statusCode: 409,
      message: 'Resource already exists',
      code: 'DUPLICATE_RESOURCE',
    });
  }
  if (err.code === '23503') {
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid resource reference',
      code: 'INVALID_REFERENCE',
    });
  }

  if (err instanceof AppError) {
    logger.warn('Operational error', {
      path: req.originalUrl,
      method: req.method,
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
    });

    return sendError(res, {
      statusCode: err.statusCode,
      message: err.message,
      code: err.code,
      details: err.details || {},
    });
  }

  logger.error('Unhandled server error', {
    path: req.originalUrl,
    method: req.method,
    error: err,
  });

  return sendError(res, {
    statusCode: 500,
    message: env.isProduction ? 'Internal server error' : err.message || 'Internal server error',
    code: 'INTERNAL_SERVER_ERROR',
    details: env.isProduction ? {} : { name: err.name },
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};

