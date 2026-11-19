const fs = require('fs');
const path = require('path');
const { query, closePool } = require('../config/db');
const { logger } = require('../utils/logger');

async function initDatabase() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await query(sql);
  logger.info('Database schema initialized successfully');
}

if (require.main === module) {
  initDatabase()
    .then(async () => {
      await closePool();
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error('Failed to initialize database schema', { error: err });
      await closePool();
      process.exit(1);
    });
}

module.exports = { initDatabase };

