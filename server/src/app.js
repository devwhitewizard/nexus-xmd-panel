const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { env } = require('./config/env');
const { sanitizeInput } = require('./middleware/sanitize.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const { sendSuccess } = require('./utils/apiResponse');

const authRoutes = require('./routes/auth.routes');
const accountRoutes = require('./routes/account.routes');
const botsRoutes = require('./routes/bots.routes');
const panelsRoutes = require('./routes/panels.routes');
const currencyRoutes = require('./routes/currency.routes');
const ordersRoutes = require('./routes/orders.routes');
const transactionsRoutes = require('./routes/transactions.routes');
const adminRoutes = require('./routes/admin.routes');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());

  const allowedOrigins = env.corsOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('CORS origin not allowed'));
      },
      credentials: true,
    })
  );

  app.use(
    rateLimit({
      windowMs: env.rateLimit.windowMs,
      max: env.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        message: 'Too many requests, please try again later',
        error: { code: 'RATE_LIMIT_EXCEEDED', details: {} },
      },
    })
  );

  app.use(express.json({ limit: env.requestSizeLimit }));
  app.use(express.urlencoded({ extended: false, limit: env.requestSizeLimit }));
  app.use(sanitizeInput);

  app.get('/health', (req, res) => {
    return sendSuccess(res, {
      message: 'Service is healthy',
      data: {
        status: 'ok',
        environment: env.nodeEnv,
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/account', accountRoutes);
  app.use('/api/bots', botsRoutes);
  app.use('/api/panels', panelsRoutes);
  app.use('/api/currency', currencyRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/transactions', transactionsRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };

