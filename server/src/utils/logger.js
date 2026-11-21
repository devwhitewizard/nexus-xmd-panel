const SENSITIVE_KEYS = new Set([
  'authorization',
  'x-api-key',
  'api_key',
  'api_key_encrypted',
  'application_api_key',
  'panel_api_key',
  'encryption_master_key',
  'apikey',
  'bwm_api_key',
  'password',
  'password_hash',
  'panel_password',
  'sftp_password',
  'admin_password',
  'jwt_secret',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'session_id',
  'session',
  'database_url',
]);

function redactSensitive(value, depth = 0) {
  if (depth > 6) return '[MAX_DEPTH]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (/^Bearer\s+/i.test(value)) {
      return 'Bearer [REDACTED]';
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1));
  }
  if (typeof value === 'object') {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        code: value.code,
        statusCode: value.statusCode,
      };
    }
    const sanitized = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(String(key).toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = redactSensitive(val, depth + 1);
      }
    }
    return sanitized;
  }
  return value;
}

function writeLog(level, message, meta = {}) {
  if (process.env.NODE_ENV === 'test' && level !== 'error') {
    return;
  }
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(Object.keys(meta).length > 0 ? { meta: redactSensitive(meta) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

module.exports = {
  redactSensitive,
  logger: {
    info: (message, meta) => writeLog('info', message, meta),
    warn: (message, meta) => writeLog('warn', message, meta),
    error: (message, meta) => writeLog('error', message, meta),
  },
};

