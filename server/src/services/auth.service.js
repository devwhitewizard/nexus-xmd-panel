const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const userModel = require('../models/user.model');
const auditLogModel = require('../models/auditLog.model');
const { ConflictError, UnauthorizedError, ForbiddenError } = require('../utils/errors');

const BCRYPT_ROUNDS = 12;

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      username: user.username,
    },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );
}

async function register({ email, username, password }, reqMeta = {}) {
  const existingEmail = await userModel.findByEmail(email);
  if (existingEmail) {
    throw new ConflictError('Email is already registered', {}, 'EMAIL_EXISTS');
  }

  const existingUsername = await userModel.findByUsername(username);
  if (existingUsername) {
    throw new ConflictError('Username is already taken', {}, 'USERNAME_EXISTS');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await userModel.createUser({
    email,
    username,
    passwordHash,
    role: 'customer',
  });

  const token = signToken(user);

  await auditLogModel.createAuditLog({
    userId: user.id,
    action: 'USER_REGISTERED',
    resourceType: 'user',
    resourceId: user.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    status: 'success',
  });

  return { user, token };
}

async function login({ email, password }, reqMeta = {}) {
  const userWithHash = await userModel.findByEmail(email);
  if (!userWithHash) {
    throw new UnauthorizedError('Invalid email or password', {}, 'INVALID_CREDENTIALS');
  }

  const passwordMatches = await bcrypt.compare(password, userWithHash.password_hash);
  if (!passwordMatches) {
    await auditLogModel.createAuditLog({
      userId: userWithHash.id,
      action: 'USER_LOGIN_FAILED',
      resourceType: 'user',
      resourceId: userWithHash.id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      status: 'failed',
    });
    throw new UnauthorizedError('Invalid email or password', {}, 'INVALID_CREDENTIALS');
  }

  if (!userWithHash.is_active) {
    throw new ForbiddenError('Account is disabled', {}, 'ACCOUNT_DISABLED');
  }

  const { password_hash, ...user } = userWithHash;
  const token = signToken(user);

  await auditLogModel.createAuditLog({
    userId: user.id,
    action: 'USER_LOGIN',
    resourceType: 'user',
    resourceId: user.id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    status: 'success',
  });

  return { user, token };
}

async function getProfile(userId) {
  return userModel.findById(userId);
}

module.exports = {
  register,
  login,
  getProfile,
  signToken,
};

