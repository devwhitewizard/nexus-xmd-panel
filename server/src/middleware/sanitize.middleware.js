const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function cleanValue(value, depth = 0) {
  if (depth > 10) return value;
  if (typeof value === 'string') {
    // Strip null bytes and trim outer whitespace
    return value.replace(/\0/g, '').trim();
  }
  if (Array.isArray(value)) {
    return value.map((item) => cleanValue(item, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    const cleaned = {};
    for (const [key, val] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      cleaned[key] = cleanValue(val, depth + 1);
    }
    return cleaned;
  }
  return value;
}

function sanitizeInput(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = cleanValue(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = cleanValue(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = cleanValue(req.params);
  }
  next();
}

module.exports = {
  sanitizeInput,
  cleanValue,
};

