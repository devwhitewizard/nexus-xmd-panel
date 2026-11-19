function sendSuccess(res, { statusCode = 200, message = 'Operation completed successfully', data = {} } = {}) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

function sendError(
  res,
  { statusCode = 500, message = 'Operation failed', code = 'INTERNAL_ERROR', details = {} } = {}
) {
  return res.status(statusCode).json({
    success: false,
    message,
    error: {
      code,
      details,
    },
  });
}

module.exports = {
  sendSuccess,
  sendError,
};

