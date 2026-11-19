class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad request', details = {}, code = 'BAD_REQUEST') {
    super(message, 400, code, details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details = {}, code = 'UNAUTHORIZED') {
    super(message, 401, code, details);
  }
}

class InsufficientBalanceError extends AppError {
  constructor(message = 'Insufficient balance', details = {}, code = 'INSUFFICIENT_BALANCE') {
    super(message, 402, code, details);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details = {}, code = 'FORBIDDEN') {
    super(message, 403, code, details);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details = {}, code = 'NOT_FOUND') {
    super(message, 404, code, details);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details = {}, code = 'CONFLICT') {
    super(message, 409, code, details);
  }
}

class UpstreamError extends AppError {
  constructor(message = 'Upstream service failure', statusCode = 502, code = 'UPSTREAM_ERROR', details = {}) {
    super(message, statusCode, code, details);
  }
}

class UncertainOperationError extends AppError {
  constructor(
    message = 'Paid operation outcome is uncertain and requires reconciliation before retrying',
    details = {},
    code = 'UNCERTAIN_PAID_OPERATION'
  ) {
    super(message, 502, code, details);
    this.isUncertain = true;
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  InsufficientBalanceError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UpstreamError,
  UncertainOperationError,
};

