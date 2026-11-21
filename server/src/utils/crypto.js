const crypto = require('crypto');
const { env } = require('../config/env');
const { AppError } = require('./errors');

const ALGORITHM = 'aes-256-gcm';
const FORMAT_VERSION = 'v1';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function parseMasterKey(rawKey = env.encryption.masterKey) {
  if (typeof rawKey !== 'string' || rawKey.trim().length === 0) {
    throw new AppError(
      'ENCRYPTION_MASTER_KEY is not configured',
      500,
      'ENCRYPTION_KEY_MISSING'
    );
  }

  const trimmed = rawKey.trim();
  let keyBuffer = null;

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    keyBuffer = Buffer.from(trimmed, 'hex');
  } else {
    const b64 = Buffer.from(trimmed, 'base64');
    if (b64.length === KEY_LENGTH) {
      keyBuffer = b64;
    }
  }

  if (!keyBuffer || keyBuffer.length !== KEY_LENGTH) {
    throw new AppError(
      'ENCRYPTION_MASTER_KEY must be a 32-byte key (64 hex characters or 32-byte base64)',
      500,
      'ENCRYPTION_KEY_INVALID'
    );
  }

  return keyBuffer;
}

function encryptSecret(plaintext, rawKey = env.encryption.masterKey) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new AppError('Secret value must be a non-empty string', 400, 'INVALID_SECRET');
  }

  const key = parseMasterKey(rawKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    FORMAT_VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

function decryptSecret(encryptedPayload, rawKey = env.encryption.masterKey) {
  if (typeof encryptedPayload !== 'string' || encryptedPayload.length === 0) {
    throw new AppError('Encrypted payload is missing', 500, 'DECRYPTION_FAILED');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new AppError('Unsupported encrypted secret format', 500, 'DECRYPTION_FAILED');
  }

  const [, ivB64, tagB64, cipherB64] = parts;
  const key = parseMasterKey(rawKey);
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(cipherB64, 'base64');

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH || ciphertext.length === 0) {
    throw new AppError('Malformed encrypted secret payload', 500, 'DECRYPTION_FAILED');
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    throw new AppError('Failed to decrypt stored credential', 500, 'DECRYPTION_FAILED');
  }
}

module.exports = {
  FORMAT_VERSION,
  parseMasterKey,
  encryptSecret,
  decryptSecret,
};

