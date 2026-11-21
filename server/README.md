# Nexus XMD Reseller Platform — Backend API

Production-ready Node.js / Express.js backend for reselling **BWM XMD** services using Supabase PostgreSQL and a centralized Axios client.

## Architecture Overview

- **Single Reseller Key + Multi-Tenant Ownership:** BWM API calls authenticate with a single `BWM_API_KEY` (`Authorization: Bearer ...`). Every customer bot and order is mapped in Supabase PostgreSQL (`users`, `bots`, `orders`, `transactions`, `platform_settings`, `audit_logs`) and enforced via JWT + RBAC + ownership middleware.
- **No Auto-Retries on Paid Operations:** Paid endpoints (`POST /bots/deploy`, `POST /bots/recover`, `POST /bots/:id/extend`) never automatically retry on network timeouts or 5xx responses. Uncertain outcomes are recorded with status `uncertain` in `orders` and `transactions` for reconciliation.
- **Strict Secret & Session Redaction:** `BWM_API_KEY`, `JWT_SECRET`, `password_hash`, and `session_id` are never logged or returned in error payloads.

## Setup & Installation

1. **Install dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Configure environment variables:**
   Copy `.env.example` to `.env` and fill in your Supabase PostgreSQL `DATABASE_URL`, `JWT_SECRET`, and `BWM_API_KEY`:
   ```env
   NODE_ENV=development
   PORT=5000
   CORS_ORIGIN=http://localhost:3000
   REQUEST_SIZE_LIMIT=1mb

   DATABASE_URL=postgresql://postgres:your_password@db.your-project-ref.supabase.co:5432/postgres
   DB_SSL=true
   DB_SSL_REJECT_UNAUTHORIZED=false

   JWT_SECRET=your_random_secret_at_least_32_chars
   JWT_EXPIRES_IN=7d

   BWM_API_BASE_URL=https://pro.bwmxmd.co.ke/api/v1
   BWM_API_KEY=your_private_bwm_api_key
   BWM_API_TIMEOUT_MS=15000
   ```

3. **Initialize Supabase PostgreSQL schema:**
   ```bash
   npm run db:init
   ```
   (Or run `src/db/schema.sql` directly in the Supabase SQL Editor.)

4. **Start the server:**
   ```bash
   npm run dev     # development (watch mode)
   npm start       # production
   ```

5. **Run automated tests (mocked BWM API):**
   ```bash
   npm test
   ```

## Standard API Response Format

**Success:**
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {}
}
```

**Error:**
```json
{
  "success": false,
  "message": "Operation failed",
  "error": {
    "code": "ERROR_CODE",
    "details": {}
  }
}
```

## API Endpoints

### Health
- `GET /health` — Server health check.

### Authentication (`/api/auth`)
- `POST /api/auth/register` — Register a customer (`email`, `username`, `password`).
- `POST /api/auth/login` — Login (`email`, `password`) -> returns `{ user, token }`.
- `GET /api/auth/me` — Get current authenticated user profile (`Bearer <token>`).

### BWM Account (`/api/account`, Admin Only)
- `GET /api/account/balance` — Retrieve reseller XD wallet balance, referral balance, local currency, and API usage stats.
- `GET /api/account/orders` — Retrieve up to the last 200 BWM API calls with timestamps and XD charges.

### Bot Deployment & Management (`/api/bots`, Authenticated)
All `:id` routes enforce ownership (`customer` owns the bot, or `admin`).

- `GET /api/bots/pricing` — Live BWM bot pricing tiers.
- `GET /api/bots/templates` — Available BWM bot templates.
- `POST /api/bots/deploy` — Deploy a bot:
  - Body: `{ "app_name": "my-bot-1", "session_id": "...", "days": 30, "custom_name": "My Bot", "template_id": "<uuid>" }`
  - Validates `app_name` (`^[a-z0-9-]{3,40}$`), `session_id` (required), `days` (against live BWM pricing), `template_id` (UUID when supplied).
- `POST /api/bots/recover` — Recover an existing bot (`app_name`, `bot_id`, `session_id`, `custom_name`).
- `GET /api/bots` — List owned bots (or all bots for `admin`) with `days_remaining` calculated from `expires_at`.
- `GET /api/bots/:id` — Get live & synced bot details.
- `POST /api/bots/:id/start` — Start bot.
- `POST /api/bots/:id/stop` — Stop bot.
- `POST /api/bots/:id/restart` — Restart bot.
- `POST /api/bots/:id/extend` — Extend bot lifetime (`{ "days": 30 }`, validated against live pricing).
- `GET /api/bots/:id/logs` — Retrieve runtime & build logs.
- `GET /api/bots/:id/vars` — Retrieve bot environment variables.
- `PUT /api/bots/:id/vars` — Update bot environment variables (`{ "env_vars": { "KEY": "VALUE" } }`).
- `DELETE /api/bots/:id` — Delete bot **only** via an authorized recovery workflow (`{ "recovery_authorized": true, "reason": "..." }`, admin-authorized).

### Admin (`/api/admin`, Admin Only)
- `GET /api/admin/orders` — View platform orders (filterable by `?status=uncertain`).
- `GET /api/admin/users` — List registered users.
- `GET /api/admin/audit-logs` — View security & billing audit logs.
- `GET /api/admin/settings` — List platform settings.
- `PUT /api/admin/settings` — Upsert a platform setting (`{ "key": "...", "value": {}, "description": "..." }`).

### Multi-Provider Panels, Connections, Discovery & Packages (`/api/panels`)
- **Existing BWM XMD Panels (Authenticated):**
  - `GET /api/panels/plans` — Live BWM XMD panel plans.
  - `GET /api/panels` — Customer-owned saved panel records.
  - `POST /api/panels/provision` — Provision a BWM XMD panel (`{ "username", "password", "plan" }`).
- **Providers & Pterodactyl Connections (Admin Only):**
  - `GET /api/panels/providers` — List registered providers & explicit capabilities.
  - `GET /api/panels/connections` / `POST /api/panels/connections` — List or register Pterodactyl connections (`ENCRYPTION_MASTER_KEY` AES-256-GCM encrypted API keys, SSRF + DNS-rebinding protected).
  - `GET/PUT/DELETE /api/panels/connections/:id` & `PATCH /api/panels/connections/:id/status` — Inspect, update/rotate key, enable/disable, or safely delete connections.
  - `POST /api/panels/connections/:id/test` — Safe read-only Application API verification.
  - `GET /api/panels/connections/:id/resources`, `POST .../resources/refresh`, `PUT .../resources/configuration` — Cached discovery snapshots & validated manual overrides.
- **Server Packages (`server_packages` table):**
  - **Customer (Read-Only):** `GET /api/panels/packages`, `GET /api/panels/packages/:id` — Returns enabled and currently available packages (strips internal `connection_id` and `provider_key`).
  - **Admin:** `GET /api/panels/admin/packages`, `POST /api/panels/admin/packages`, `GET/PUT/DELETE /api/panels/admin/packages/:id`, `PATCH /api/panels/admin/packages/:id/status`.
  - **Validation Rules:** Pterodactyl packages require an enabled `connection_id`, a completed resource discovery snapshot, valid `nest_id` + matching `egg_id`, and valid `location_id`/`node_id`/`allocation_id` (matching node). BWM XMD packages must not set `connection_id` and validate optional `bwm_plan_id` against live BWM plans. Deletion is blocked (`409 PACKAGE_IN_USE`) if dependent `panel_servers` or `orders` exist.
- **Provider Assignment & Resolution (Admin Only):**
  - `GET /api/panels/admin/providers` — Lists registered providers with `declared_capabilities`, `implemented_capabilities`, and `is_enabled` status.
  - `GET /api/panels/admin/provider-assignments` & `GET /api/panels/admin/provider-assignments/:packageId` — Lists or views package provider assignments and validation status.
  - `PUT /api/panels/admin/provider-assignments/:packageId` — Assigns/changes a package's provider and connection for **future orders only** (existing orders retain their immutable `provider_assignment_snapshot`, and existing servers retain their original `provider_key`/`connection_id`).
  - `POST /api/panels/admin/provider-assignments/:packageId/validate` — Validates a package's provider assignment without modifying it.
- **Order-Based Server Provisioning & Reconciliation (`provisioning_logs` table):**
  - **Customer (Owned Orders):**
    - `POST /api/panels/orders/:orderId/provision` — Provisions an eligible (`completed`/`paid`/`accepted`) order using its immutable `provider_assignment_snapshot` and PostgreSQL row-level locking + DB idempotency (`order:<id>:attempt:<n>`).
    - `GET /api/panels/orders/:orderId/provisioning-status` — Retrieves provisioning state (`pending`, `processing`, `successful`, `failed`, `uncertain`) and associated server record.
  - **Admin:**
    - `GET /api/panels/admin/provisioning` & `GET /api/panels/admin/provisioning/:id` — Inspect provisioning logs.
    - `POST /api/panels/admin/provisioning/:id/reconcile` — Safely queries Pterodactyl by `external_id` (`idempotency_key`) to confirm creation or non-creation before allowing any retry.
    - `POST /api/panels/admin/provisioning/:id/retry` — Authorizes a new attempt **only** when the prior log is definitively `failed` (blocked with `409 RETRY_NOT_ALLOWED` for `uncertain`).

### Future Modular Services (`src/services/future/`)
Prepared placeholders (no undocumented endpoints):
- `socialBoost.service.js` — Social Media Boosting
- `panels.service.js` — Panel Servers
- `ghanaData.service.js` — Ghana Data Services
- `currency.service.js` — Currency Conversion & Pricing

