const axios = require('axios');
const { env } = require('../../config/env');
const { logger } = require('../../utils/logger');
const {
  BadRequestError,
  InsufficientBalanceError,
  ForbiddenError,
  NotFoundError,
  UpstreamError,
  UncertainOperationError,
} = require('../../utils/errors');

function createBwmHttpClient() {
  return axios.create({
    baseURL: env.bwm.baseUrl,
    timeout: env.bwm.timeoutMs,
    headers: {
      Authorization: `Bearer ${env.bwm.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    // Never follow redirects that might drop auth or repeat requests
    maxRedirects: 0,
  });
}

let httpClient = createBwmHttpClient();

function setBwmHttpClient(customClient) {
  httpClient = customClient;
}

function resetBwmHttpClient() {
  httpClient = createBwmHttpClient();
}

function extractUpstreamDetails(data) {
  if (!data || typeof data !== 'object') {
    return {};
  }
  const safeDetails = {};
  if (data.code) safeDetails.upstreamCode = data.code;
  if (data.error && typeof data.error === 'string') safeDetails.upstreamError = data.error;
  if (data.error && typeof data.error === 'object') {
    if (data.error.code) safeDetails.upstreamCode = data.error.code;
    if (data.error.message) safeDetails.upstreamMessage = data.error.message;
    if (data.error.details) safeDetails.upstreamDetails = data.error.details;
  }
  if (data.details) safeDetails.upstreamDetails = data.details;
  if (data.charged_xd !== undefined) safeDetails.charged_xd = data.charged_xd;
  if (data.balance_after !== undefined) safeDetails.balance_after = data.balance_after;
  return safeDetails;
}

function normalizeBwmError(error, { method, url, isPaid = false }) {
  // Network failure, DNS error, connection refused, or timeout -> NO response
  if (!error.response) {
    const reason = error.code || error.message || 'NETWORK_ERROR';
    logger.error('BWM API network/timeout failure', { method, url, isPaid, reason });

    if (isPaid) {
      return new UncertainOperationError(
        'BWM API request timed out or failed during a paid operation; outcome is uncertain and requires reconciliation',
        { reason, method, url }
      );
    }

    return new UpstreamError(
      'Unable to reach BWM API service',
      502,
      'BWM_NETWORK_FAILURE',
      { reason }
    );
  }

  const { status, data } = error.response;
  const upstreamMessage =
    (data && (data.message || data.error?.message || (typeof data.error === 'string' ? data.error : null))) ||
    `BWM API returned HTTP ${status}`;
  const details = extractUpstreamDetails(data);

  logger.warn('BWM API error response', { method, url, status, isPaid, details });

  switch (status) {
    case 400:
      return new BadRequestError(upstreamMessage, details, details.upstreamCode || 'BWM_BAD_REQUEST');
    case 401:
      return new UpstreamError(
        upstreamMessage || 'Invalid BWM API credentials',
        401,
        'BWM_INVALID_CREDENTIALS',
        details
      );
    case 402:
      return new InsufficientBalanceError(
        upstreamMessage || 'Insufficient BWM XD wallet balance',
        details,
        'BWM_INSUFFICIENT_BALANCE'
      );
    case 403:
      return new ForbiddenError(upstreamMessage || 'Forbidden by BWM API', details, 'BWM_FORBIDDEN');
    case 404:
      return new NotFoundError(upstreamMessage || 'Resource not found on BWM API', details, 'BWM_NOT_FOUND');
    case 500:
      if (isPaid) {
        return new UncertainOperationError(
          'BWM API returned 500 during a paid operation; verify order history before retrying',
          { upstreamStatus: 500, ...details }
        );
      }
      return new UpstreamError(upstreamMessage, 500, 'BWM_INTERNAL_ERROR', details);
    case 502:
    case 503:
    case 504:
    default:
      if (isPaid && status >= 500) {
        return new UncertainOperationError(
          `BWM API returned HTTP ${status} during a paid operation; verify order history before retrying`,
          { upstreamStatus: status, ...details }
        );
      }
      return new UpstreamError(
        upstreamMessage,
        status >= 500 ? 502 : status,
        'BWM_UPSTREAM_FAILURE',
        { upstreamStatus: status, ...details }
      );
  }
}

/**
 * Execute a single BWM API request without automatic retries.
 * Paid operations (isPaid: true) never retry on timeout or 5xx.
 */
async function request({ method, url, data = undefined, params = undefined, isPaid = false, timeout = undefined }) {
  try {
    const response = await httpClient.request({
      method,
      url,
      ...(data !== undefined ? { data } : {}),
      ...(params !== undefined ? { params } : {}),
      ...(timeout !== undefined ? { timeout } : {}),
    });
    return response.data;
  } catch (error) {
    throw normalizeBwmError(error, { method, url, isPaid });
  }
}

module.exports = {
  request,
  setBwmHttpClient,
  resetBwmHttpClient,
  normalizeBwmError,
};

