const http = require('http');
const https = require('https');
const axios = require('axios');
const { validatePanelUrl, createPinnedLookup } = require('../../utils/ssrfGuard');
const { logger } = require('../../utils/logger');
const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UpstreamError,
  UncertainOperationError,
} = require('../../utils/errors');

const DEFAULT_TIMEOUT_MS = 10000;

let customHttpAdapter = null;

function setPterodactylHttpClient(client) {
  customHttpAdapter = client;
}

function resetPterodactylHttpClient() {
  customHttpAdapter = null;
}

function buildSafeAgents() {
  const pinnedLookup = createPinnedLookup();
  return {
    httpAgent: new http.Agent({ lookup: pinnedLookup, keepAlive: false }),
    httpsAgent: new https.Agent({ lookup: pinnedLookup, keepAlive: false }),
  };
}

function normalizePterodactylError(error, { method, path, isMutating = false }) {
  if (!error.response) {
    if (error.code === 'SSRF_BLOCKED_IP' || error.code === 'SSRF_BLOCKED_HOST' || error.code === 'DNS_RESOLUTION_FAILED') {
      return error;
    }
    const reason = error.code || error.message || 'NETWORK_ERROR';
    logger.error('Pterodactyl API network/timeout failure', { method, path, isMutating, reason });
    if (isMutating) {
      return new UncertainOperationError(
        'Pterodactyl server creation timed out or failed; outcome is uncertain and requires reconciliation',
        { reason, method, path }
      );
    }
    return new UpstreamError(
      'Unable to reach Pterodactyl panel',
      502,
      'PTERODACTYL_NETWORK_ERROR',
      { reason }
    );
  }

  const { status, data } = error.response;
  const firstError = Array.isArray(data?.errors) ? data.errors[0] : null;
  const message =
    firstError?.detail ||
    data?.message ||
    `Pterodactyl panel returned HTTP ${status}`;

  logger.warn('Pterodactyl API error response', { method, path, status, isMutating });

  if (status === 400 || status === 422) {
    return new BadRequestError(message, { upstreamStatus: status }, 'PTERODACTYL_BAD_REQUEST');
  }
  if (status === 401) {
    return new UpstreamError(
      'Invalid Pterodactyl Application API key',
      401,
      'PTERODACTYL_UNAUTHORIZED'
    );
  }
  if (status === 403) {
    return new ForbiddenError(
      'Pterodactyl Application API key lacks required permissions',
      { upstreamStatus: 403 },
      'PTERODACTYL_FORBIDDEN'
    );
  }
  if (status === 404) {
    return new NotFoundError(message, { upstreamStatus: 404 }, 'PTERODACTYL_NOT_FOUND');
  }
  if (status === 429) {
    return new UpstreamError('Pterodactyl panel rate limit exceeded', 429, 'PTERODACTYL_RATE_LIMITED');
  }

  if (isMutating && status >= 500) {
    return new UncertainOperationError(
      `Pterodactyl panel returned HTTP ${status} during server creation; reconcile before retrying`,
      { upstreamStatus: status, method, path }
    );
  }

  return new UpstreamError(
    message,
    502,
    'PTERODACTYL_UPSTREAM_ERROR',
    { upstreamStatus: status }
  );
}

async function request({
  panelUrl,
  apiKey,
  method = 'GET',
  path,
  params = undefined,
  data = undefined,
  timeout = DEFAULT_TIMEOUT_MS,
  isMutating = false,
  allowEmptyResponse = false,
}) {
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new BadRequestError('Pterodactyl API key is required', {}, 'INVALID_API_KEY');
  }

  // Re-validate panel URL on every outbound request to prevent SSRF
  const { normalizedUrl } = await validatePanelUrl(panelUrl);
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = `${normalizedUrl}${cleanPath}`;

  try {
    let response;
    if (customHttpAdapter) {
      response = await customHttpAdapter.request({
        method,
        url: fullUrl,
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          Accept: 'Application/vnd.pterodactyl.v1+json',
          'Content-Type': 'application/json',
        },
        ...(params !== undefined ? { params } : {}),
        ...(data !== undefined ? { data } : {}),
        timeout,
        maxRedirects: 0,
      });
    } else {
      const { httpAgent, httpsAgent } = buildSafeAgents();
      response = await axios.request({
        method,
        url: fullUrl,
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          Accept: 'Application/vnd.pterodactyl.v1+json',
          'Content-Type': 'application/json',
        },
        ...(params !== undefined ? { params } : {}),
        ...(data !== undefined ? { data } : {}),
        timeout,
        maxRedirects: 0,
        httpAgent,
        httpsAgent,
      });
    }

    if (allowEmptyResponse && (response.data === '' || response.data === undefined || response.data === null)) {
      return {};
    }

    if (!response.data || typeof response.data !== 'object') {
      throw new UpstreamError(
        'Pterodactyl panel returned an unexpected non-JSON response',
        502,
        'PTERODACTYL_INVALID_RESPONSE'
      );
    }

    return response.data;
  } catch (error) {
    if (
      error.name === 'UpstreamError' ||
      error.name === 'BadRequestError' ||
      error.name === 'UncertainOperationError'
    ) {
      throw error;
    }
    throw normalizePterodactylError(error, { method, path: cleanPath, isMutating });
  }
}

/**
 * Safe read-only Application API check used to verify panel URL and credentials.
 */
async function testConnection({ panelUrl, apiKey }) {
  const payload = await request({
    panelUrl,
    apiKey,
    method: 'GET',
    path: '/api/application/nodes',
    params: { per_page: 1 },
  });

  if (payload.object !== 'list' || !Array.isArray(payload.data)) {
    throw new UpstreamError(
      'Connected endpoint did not return a valid Pterodactyl Application API response',
      502,
      'PTERODACTYL_INVALID_RESPONSE'
    );
  }

  return {
    connected: true,
    node_count: payload.meta?.pagination?.total ?? payload.data.length,
  };
}

/**
 * Safely paginate through all pages of a Pterodactyl Application API list endpoint.
 * Enforces panel origin boundaries and caps total pages.
 */
async function fetchAllPages({ panelUrl, apiKey, path, params = {}, maxPages = 100 }) {
  const { normalizedUrl } = await validatePanelUrl(panelUrl);
  const allItems = [];
  let currentPage = 1;
  let totalPages = 1;

  while (currentPage <= totalPages && currentPage <= maxPages) {
    const payload = await request({
      panelUrl: normalizedUrl,
      apiKey,
      method: 'GET',
      path,
      params: {
        per_page: 50,
        ...params,
        page: currentPage,
      },
    });

    if (payload.object !== 'list' || !Array.isArray(payload.data)) {
      throw new UpstreamError(
        `Pterodactyl endpoint "${path}" returned an invalid list payload`,
        502,
        'PTERODACTYL_INVALID_RESPONSE'
      );
    }

    allItems.push(...payload.data);

    const nextLink = payload.meta?.pagination?.links?.next;
    if (typeof nextLink === 'string' && nextLink.length > 0) {
      let nextOrigin;
      try {
        nextOrigin = new URL(nextLink).origin;
      } catch {
        throw new UpstreamError(
          'Pterodactyl pagination link is malformed',
          502,
          'PTERODACTYL_INVALID_RESPONSE'
        );
      }
      if (nextOrigin !== normalizedUrl) {
        throw new UpstreamError(
          'Pterodactyl pagination link attempted to leave trusted panel origin',
          502,
          'SSRF_BLOCKED_HOST'
        );
      }
    }

    const reportedTotal = Number(payload.meta?.pagination?.total_pages);
    totalPages = Number.isInteger(reportedTotal) && reportedTotal >= 1 ? reportedTotal : 1;
    currentPage += 1;
  }

  return allItems;
}

/**
 * Look up an existing Pterodactyl panel user by email, or create one if absent.
 * Required because Pterodactyl server creation expects an integer panel user ID.
 */
async function findOrCreateUser({ panelUrl, apiKey, email, username }) {
  const listRes = await request({
    panelUrl,
    apiKey,
    method: 'GET',
    path: '/api/application/users',
    params: { 'filter[email]': email, per_page: 25 },
  });

  if (listRes.object === 'list' && Array.isArray(listRes.data)) {
    const exactMatch = listRes.data.find(
      (u) => String(u?.attributes?.email || '').toLowerCase() === String(email).toLowerCase()
    );
    if (exactMatch && Number.isInteger(exactMatch.attributes?.id)) {
      return exactMatch.attributes;
    }
  }

  const safeUsername = String(username || email.split('@')[0])
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 32);

  const createdRes = await request({
    panelUrl,
    apiKey,
    method: 'POST',
    path: '/api/application/users',
    data: {
      email,
      username: safeUsername,
      first_name: safeUsername,
      last_name: 'Customer',
    },
    isMutating: false,
  });

  if (!createdRes?.attributes?.id) {
    throw new UpstreamError(
      'Pterodactyl user lookup/creation returned an invalid response',
      502,
      'PTERODACTYL_INVALID_RESPONSE'
    );
  }

  return createdRes.attributes;
}

/**
 * Create a server on Pterodactyl via Application API.
 * Marks timeouts and 5xx as UncertainOperationError so callers never blindly retry.
 */
async function createServer({ panelUrl, apiKey, payload }) {
  const res = await request({
    panelUrl,
    apiKey,
    method: 'POST',
    path: '/api/application/servers',
    data: payload,
    isMutating: true,
  });

  if (res.object !== 'server' || !res.attributes?.id) {
    throw new UpstreamError(
      'Pterodactyl server creation returned an unexpected response payload',
      502,
      'PTERODACTYL_INVALID_RESPONSE'
    );
  }

  return res.attributes;
}

/**
 * Query a Pterodactyl server by its unique external_id for safe reconciliation.
 * Returns null if the server does not exist (HTTP 404).
 */
async function findServerByExternalId({ panelUrl, apiKey, externalId }) {
  try {
    const res = await request({
      panelUrl,
      apiKey,
      method: 'GET',
      path: `/api/application/servers/external/${encodeURIComponent(externalId)}`,
    });
    if (res.object === 'server' && res.attributes?.id) {
      return res.attributes;
    }
    throw new UpstreamError(
      'Unexpected response when querying server by external_id',
      502,
      'PTERODACTYL_INVALID_RESPONSE'
    );
  } catch (err) {
    if (err.statusCode === 404 || err.code === 'PTERODACTYL_NOT_FOUND') {
      return null;
    }
    throw err;
  }
}

/**
 * Retrieve server details from Pterodactyl Application API by internal server ID.
 */
async function getServerDetails({ panelUrl, apiKey, externalServerId }) {
  const res = await request({
    panelUrl,
    apiKey,
    method: 'GET',
    path: `/api/application/servers/${encodeURIComponent(externalServerId)}`,
  });
  if (res.object !== 'server' || !res.attributes?.id) {
    throw new UpstreamError(
      'Pterodactyl returned an invalid server details response',
      502,
      'PTERODACTYL_INVALID_RESPONSE'
    );
  }
  return res.attributes;
}

/**
 * Send a power signal ('start' | 'stop' | 'restart') via Pterodactyl Client API.
 * Only reports acceptance if Pterodactyl confirms HTTP 2xx.
 */
async function setPowerState({ panelUrl, apiKey, identifier, signal }) {
  await request({
    panelUrl,
    apiKey,
    method: 'POST',
    path: `/api/client/servers/${encodeURIComponent(identifier)}/power`,
    data: { signal },
    allowEmptyResponse: true,
  });
  return { accepted: true, signal };
}

/**
 * Retrieve live server resource utilization via Pterodactyl Client API.
 */
async function getServerResources({ panelUrl, apiKey, identifier }) {
  const res = await request({
    panelUrl,
    apiKey,
    method: 'GET',
    path: `/api/client/servers/${encodeURIComponent(identifier)}/resources`,
  });
  if (!res?.attributes) {
    throw new UpstreamError(
      'Pterodactyl returned an invalid server resources response',
      502,
      'PTERODACTYL_INVALID_RESPONSE'
    );
  }
  return res.attributes;
}

module.exports = {
  request,
  testConnection,
  fetchAllPages,
  findOrCreateUser,
  createServer,
  findServerByExternalId,
  getServerDetails,
  setPowerState,
  getServerResources,
  setPterodactylHttpClient,
  resetPterodactylHttpClient,
};

