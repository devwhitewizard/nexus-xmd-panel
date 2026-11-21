const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
};

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: parsePositiveInt(process.env.PORT, 5000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  requestSizeLimit: process.env.REQUEST_SIZE_LIMIT || '1mb',

  db: {
    connectionString: process.env.DATABASE_URL || '',
    ssl: parseBoolean(process.env.DB_SSL, true),
    sslRejectUnauthorized: parseBoolean(process.env.DB_SSL_REJECT_UNAUTHORIZED, false),
    poolMax: parsePositiveInt(process.env.DB_POOL_MAX, 10),
  },

  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  encryption: {
    masterKey: process.env.ENCRYPTION_MASTER_KEY || '',
  },

  bwm: {
    baseUrl: (process.env.BWM_API_BASE_URL || 'https://pro.bwmxmd.co.ke/api/v1').replace(/\/+$/, ''),
    apiKey: process.env.BWM_API_KEY || '',
    timeoutMs: parsePositiveInt(process.env.BWM_API_TIMEOUT_MS, 15000),
  },

  rateLimit: {
    windowMs: parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: parsePositiveInt(process.env.RATE_LIMIT_MAX, 100),
    authMax: parsePositiveInt(process.env.AUTH_RATE_LIMIT_MAX, 20),
  },
};

function validateRequiredEnv() {
  const missing = [];
  if (!env.jwt.secret || env.jwt.secret.length < 16) {
    missing.push('JWT_SECRET (min 16 chars)');
  }
  if (!env.bwm.apiKey) {
    missing.push('BWM_API_KEY');
  }
  if (!env.db.connectionString) {
    missing.push('DATABASE_URL');
  }
  if (!env.encryption.masterKey) {
    missing.push('ENCRYPTION_MASTER_KEY');
  }
  if (missing.length > 0 && env.isProduction) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return missing;
}

module.exports = {
  env,
  validateRequiredEnv,
};

