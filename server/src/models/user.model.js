const { query } = require('../config/db');

const PUBLIC_USER_COLUMNS = 'id, email, username, role, is_active, wallet_balance, created_at, updated_at';

async function createUser({ email, username, passwordHash, role = 'customer' }) {
  const result = await query(
    `INSERT INTO users (email, username, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING ${PUBLIC_USER_COLUMNS}`,
    [email.toLowerCase(), username, passwordHash, role]
  );
  return result.rows[0];
}

async function findByEmail(email) {
  const result = await query(
    `SELECT ${PUBLIC_USER_COLUMNS}, password_hash FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );
  return result.rows[0] || null;
}

async function findByUsername(username) {
  const result = await query(
    `SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE username = $1`,
    [username]
  );
  return result.rows[0] || null;
}

async function findById(id) {
  const result = await query(
    `SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function listUsers({ limit = 50, offset = 0 } = {}) {
  const result = await query(
    `SELECT ${PUBLIC_USER_COLUMNS} FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
}

module.exports = {
  createUser,
  findByEmail,
  findByUsername,
  findById,
  listUsers,
};

