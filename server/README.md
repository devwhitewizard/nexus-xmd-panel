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

### Future Modular Services (`src/services/future/`)
Prepared placeholders (no undocumented endpoints):
- `socialBoost.service.js` — Social Media Boosting
- `panels.service.js` — Panel Servers
- `ghanaData.service.js` — Ghana Data Services
- `currency.service.js` — Currency Conversion & Pricing

