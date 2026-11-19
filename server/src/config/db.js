const { Pool } = require('pg');
const { env } = require('./env');
const { logger } = require('../utils/logger');

let pool = null;

function createPool() {
  if (!env.db.connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  const sslConfig = env.db.ssl
    ? { rejectUnauthorized: env.db.sslRejectUnauthorized }
    : false;

  const newPool = new Pool({
    connectionString: env.db.connectionString,
    ssl: sslConfig,
    max: env.db.poolMax,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  newPool.on('error', (err) => {
    logger.error('Unexpected PostgreSQL pool error', { error: err });
  });

  return newPool;
}

function getPool() {
  if (!pool) {
    pool = createPool();
  }
  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function getClient() {
  return getPool().connect();
}

async function withTransaction(callback) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function testConnection() {
  const result = await query('SELECT NOW() AS now');
  return result.rows[0];
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  query,
  getClient,
  withTransaction,
  testConnection,
  closePool,
};

