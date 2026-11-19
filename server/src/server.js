const { env, validateRequiredEnv } = require('./config/env');
const { testConnection, closePool } = require('./config/db');
const { createApp } = require('./app');
const { logger } = require('./utils/logger');

async function startServer() {
  const missing = validateRequiredEnv();
  if (missing.length > 0) {
    logger.warn('Starting with missing environment variables', { missing });
  }

  try {
    await testConnection();
    logger.info('Connected to Supabase PostgreSQL');
  } catch (err) {
    logger.warn('Database connection check failed at startup; continuing', {
      error: err.message,
    });
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`Nexus XMD Reseller API listening on port ${env.port}`, {
      environment: env.nodeEnv,
    });
  });

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };

