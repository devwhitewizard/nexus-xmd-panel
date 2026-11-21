const dns = require('dns');
const net = require('net');
const { URL } = require('url');
const { env } = require('../config/env');
const { BadRequestError } = require('./errors');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

function ipv4ToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inCidr4(ipInt, baseIp, prefixLen) {
  const baseInt = ipv4ToInt(baseIp);
  if (baseInt === null) return false;
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function isBlockedIpv4(ip) {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return true;

  return (
    inCidr4(ipInt, '0.0.0.0', 8) ||
    inCidr4(ipInt, '10.0.0.0', 8) ||
    inCidr4(ipInt, '100.64.0.0', 10) ||
    inCidr4(ipInt, '127.0.0.0', 8) ||
    inCidr4(ipInt, '169.254.0.0', 16) ||
    inCidr4(ipInt, '172.16.0.0', 12) ||
    inCidr4(ipInt, '192.0.0.0', 24) ||
    inCidr4(ipInt, '192.0.2.0', 24) ||
    inCidr4(ipInt, '192.168.0.0', 16) ||
    inCidr4(ipInt, '198.18.0.0', 15) ||
    inCidr4(ipInt, '198.51.100.0', 24) ||
    inCidr4(ipInt, '203.0.113.0', 24) ||
    inCidr4(ipInt, '224.0.0.0', 4) ||
    inCidr4(ipInt, '240.0.0.0', 4)
  );
}

function isBlockedIp(ip) {
  if (typeof ip !== 'string' || !ip) return true;
  const trimmed = ip.trim().toLowerCase();

  if (net.isIPv4(trimmed)) {
    return isBlockedIpv4(trimmed);
  }

  if (net.isIPv6(trimmed)) {
    if (trimmed === '::' || trimmed === '::1') return true;
    // IPv4-mapped IPv6 e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1
    if (trimmed.startsWith('::ffff:')) {
      const mapped = trimmed.slice(7);
      if (net.isIPv4(mapped)) {
        return isBlockedIpv4(mapped);
      }
      // Hex form like ::ffff:7f00:1
      const hexParts = mapped.split(':');
      if (hexParts.length === 2) {
        const hi = parseInt(hexParts[0], 16);
        const lo = parseInt(hexParts[1], 16);
        if (Number.isFinite(hi) && Number.isFinite(lo)) {
          const v4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
          return isBlockedIpv4(v4);
        }
      }
      return true;
    }
    // Unique local (fc00::/7), link-local (fe80::/10), multicast (ff00::/8)
    if (
      trimmed.startsWith('fc') ||
      trimmed.startsWith('fd') ||
      trimmed.startsWith('fe8') ||
      trimmed.startsWith('fe9') ||
      trimmed.startsWith('fea') ||
      trimmed.startsWith('feb') ||
      trimmed.startsWith('ff')
    ) {
      return true;
    }
    return false;
  }

  return true;
}

function assertSafeHostnameSyntax(hostname) {
  const lower = hostname.toLowerCase();
  if (
    BLOCKED_HOSTNAMES.has(lower) ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    throw new BadRequestError(
      'Panel URL destination is not permitted (internal or reserved hostname)',
      {},
      'SSRF_BLOCKED_HOST'
    );
  }
}

async function validatePanelUrl(
  rawUrl,
  { requireHttps = env.isProduction, lookupFn = dns.promises.lookup } = {}
) {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    throw new BadRequestError('Panel URL is required', {}, 'INVALID_PANEL_URL');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new BadRequestError('Panel URL must be a valid URL', {}, 'INVALID_PANEL_URL');
  }

  if (parsed.username || parsed.password) {
    throw new BadRequestError(
      'Panel URL must not contain embedded credentials',
      {},
      'INVALID_PANEL_URL'
    );
  }

  if (requireHttps && parsed.protocol !== 'https:') {
    throw new BadRequestError(
      'Panel URL must use HTTPS',
      {},
      'HTTPS_REQUIRED'
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BadRequestError(
      'Panel URL must use HTTPS or HTTP',
      {},
      'INVALID_PANEL_URL'
    );
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  assertSafeHostnameSyntax(hostname);

  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new BadRequestError(
        'Panel URL cannot target private, loopback, or reserved IP addresses',
        {},
        'SSRF_BLOCKED_IP'
      );
    }
    return {
      normalizedUrl: parsed.origin,
      hostname,
      resolvedIps: [{ address: hostname, family: net.isIPv6(hostname) ? 6 : 4 }],
    };
  }

  let records;
  try {
    records = await lookupFn(hostname, { all: true });
  } catch {
    throw new BadRequestError(
      'Unable to resolve panel URL hostname',
      {},
      'DNS_RESOLUTION_FAILED'
    );
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new BadRequestError('Panel URL hostname resolved to no addresses', {}, 'DNS_RESOLUTION_FAILED');
  }

  for (const record of records) {
    if (isBlockedIp(record.address)) {
      throw new BadRequestError(
        'Panel URL resolved to a private, loopback, or reserved IP address',
        {},
        'SSRF_BLOCKED_IP'
      );
    }
  }

  return {
    normalizedUrl: parsed.origin,
    hostname,
    resolvedIps: records,
  };
}

/**
 * Custom DNS lookup for Node http/https Agents that validates every resolved IP
 * at socket-connect time and pins the validated IP to prevent DNS rebinding.
 */
function createPinnedLookup(lookupFn = dns.lookup) {
  return (hostname, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'object' && options !== null ? options : {};

    try {
      assertSafeHostnameSyntax(hostname);
    } catch (err) {
      return cb(err);
    }

    lookupFn(hostname, { ...opts, all: true }, (err, addresses) => {
      if (err) return cb(err);
      if (!Array.isArray(addresses) || addresses.length === 0) {
        return cb(new BadRequestError('DNS resolution returned no addresses', {}, 'DNS_RESOLUTION_FAILED'));
      }

      for (const entry of addresses) {
        if (isBlockedIp(entry.address)) {
          return cb(
            new BadRequestError(
              'Outbound connection blocked: resolved to private or reserved IP',
              {},
              'SSRF_BLOCKED_IP'
            )
          );
        }
      }

      if (opts.all) {
        return cb(null, addresses);
      }
      return cb(null, addresses[0].address, addresses[0].family);
    });
  };
}

module.exports = {
  isBlockedIp,
  isBlockedIpv4,
  validatePanelUrl,
  createPinnedLookup,
};

