-- Nexus XMD Reseller Platform - Supabase PostgreSQL Schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Users (Customers & Admins)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Separate customer platform wallet (distinct from BWM reseller XD wallet)
  wallet_balance NUMERIC(14, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- 2. Bots (Ownership layer mapping platform customers to BWM bots)
CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  bwm_bot_id VARCHAR(128) NOT NULL UNIQUE,
  app_name VARCHAR(64) NOT NULL UNIQUE,
  custom_name VARCHAR(128),
  template_id UUID,
  status VARCHAR(40) NOT NULL DEFAULT 'unknown',
  deployed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  bwm_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bots_user_id ON bots (user_id);
CREATE INDEX IF NOT EXISTS idx_bots_bwm_bot_id ON bots (bwm_bot_id);
CREATE INDEX IF NOT EXISTS idx_bots_status ON bots (status);
CREATE INDEX IF NOT EXISTS idx_bots_deleted_at ON bots (deleted_at);

-- 3. Orders (Service purchases & lifecycle operations)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  service_type VARCHAR(50) NOT NULL,
  bwm_order_ref VARCHAR(128),
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'completed', 'failed', 'uncertain', 'refunded')
  ),
  days INTEGER,
  charged_xd NUMERIC(14, 4),
  balance_after NUMERIC(14, 4),
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  bwm_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_bot_id ON orders (bot_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);

-- 4. Transactions (Reconciliation ledger separating BWM XD & customer wallets)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  ledger_type VARCHAR(30) NOT NULL CHECK (ledger_type IN ('bwm_xd', 'customer_wallet')),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount NUMERIC(14, 4) NOT NULL DEFAULT 0,
  currency VARCHAR(16) NOT NULL DEFAULT 'XD',
  balance_after NUMERIC(14, 4),
  bwm_reference VARCHAR(128),
  status VARCHAR(30) NOT NULL DEFAULT 'completed' CHECK (
    status IN ('completed', 'uncertain', 'refunded', 'failed')
  ),
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON transactions (order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_type ON transactions (ledger_type);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC);

-- 5. Platform Settings
CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(60) NOT NULL,
  resource_id VARCHAR(128),
  ip_address VARCHAR(64),
  user_agent TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'success',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- 7. Panel Servers (Provisioned panel server ownership & records)
CREATE TABLE IF NOT EXISTS panel_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  bwm_panel_id VARCHAR(128),
  plan_id VARCHAR(64) NOT NULL,
  plan_name VARCHAR(128),
  panel_url TEXT,
  username VARCHAR(128) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  bwm_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_panel_servers_user_id ON panel_servers (user_id);
CREATE INDEX IF NOT EXISTS idx_panel_servers_created_at ON panel_servers (created_at DESC);

