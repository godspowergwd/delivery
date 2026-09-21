# Backend hardening: security, database, seeding, settings and login speed

Scope: API, Prisma schema, seed system and configuration only. No UI redesign and
no visual change (the single frontend edit is described in section A.3).

---

## A. Files changed

### A.1 Removed from the environment (configuration)

| File | Change |
| --- | --- |
| `apps/api/src/config/env.ts` | Deleted every credential and business variable: `SEED_ADMIN_EMAIL/PASSWORD`, `SEED_KITCHEN_*`, `SEED_CUSTOMER_*`, `SUPPORT_PHONE`, `SUPPORT_EMAIL`, `BUSINESS_NAME`, `CURRENCY_CODE`, `CURRENCY_SYMBOL`, `DELIVERY_FEE`, `TAX_RATE`, `MIN_ORDER_TOTAL`. Only infrastructure values remain. |
| `apps/api/.env` | Same variables removed from the local file (untracked). |
| `.env.example` | Rewritten: documents only the variables that still exist and states that accounts and business settings live in PostgreSQL. |

### A.2 New files

| File | Purpose |
| --- | --- |
| `apps/api/src/config/defaults.ts` | Single source of truth for business defaults (`DEFAULT_SETTINGS`) plus `PUBLIC_SETTING_KEYS`. No environment access, so code and database can never drift apart. |
| `apps/api/prisma/migrations/20260921140000_auth_hardening_indexes/migration.sql` | Additive migration: `User.username` + unique index, `User.lastLoginAt`, `Session.expiresAt`, `ActivityLog(userId, createdAt)`. |
| `.github/workflows/keepalive.yml` | Scheduled ping of `/api/health` so the Render service never cold-starts under a real sign-in. |
| `docs/BACKEND_HARDENING.md` | This document. |
| `scripts/verify-backend.mjs` | 17 assertions: username login, admin-only settings, immediate propagation, logout revocation. |
| `scripts/perf-login.mjs` | Times login/logout for a legacy cost-12 hash and for the new cost-10 hash on the same machine. |
| `scripts/db-tables.mjs` | Prints the connection target, tables and indexes (safe inspection helper). |

### A.3 Backend files modified

| File | Change |
| --- | --- |
| `apps/api/prisma/schema.prisma` | `User.username String? @unique`; indexes `User.lastLoginAt`, `Session.expiresAt`, `ActivityLog(userId, createdAt)`. |
| `apps/api/prisma/seed.ts` | Rewritten: three default staff accounts, create-if-missing only, bcrypt hashing, CLI password overrides, `--link-usernames`, demo data only outside production. |
| `apps/api/src/services/auth.service.ts` | DB-only login (email **or** username), batched writes, non-blocking audit, transparent hash upgrade on sign-in, faster refresh rotation and logout. |
| `apps/api/src/routes/auth.routes.ts` | Login accepts email or username; logout reads identity from the verified token instead of the database; `/auth/config` reads business/support data from the database. |
| `apps/api/src/middleware/authenticate.ts` | Session and account lookups run in one `Promise.all` round-trip. |
| `apps/api/src/services/settings.service.ts` | Defaults from `config/defaults` (no env), batched settings writes, `toPublicSettings()` / `getPublicSettings()`. |
| `apps/api/src/routes/settings.routes.ts` | Phone/email validation for `supportPhone`, `supportEmail`, `businessPhone`, `businessEmail`; new public `GET /api/settings/support`. |
| `apps/api/src/lib/password.ts` | Configurable `BCRYPT_ROUNDS` (default 10) plus `passwordCost()` / `needsRehash()` for transparent upgrades. |
| `apps/api/src/lib/validation.ts` | `usernameSchema` and `loginIdentifierSchema` (email **or** username). |
| `apps/api/src/lib/prisma.ts` | One client, one pool, single startup probe (previously `$connect()` **and** `SELECT 1`), duplicate dev probe removed. |
| `apps/api/src/lib/tokens.ts` | Access token may carry `email` so logout can be audited without a database read. |
| `apps/api/src/routes/users.routes.ts` | Admin user creation/editing supports `username` (unique, validated); `username` added to account payloads. |
| `apps/api/src/index.ts` | Startup logs the connection timing once, then listens. |
| `packages/shared/src/types.ts` | `AuthUser.username?: string \| null`. |
| `package.json` | New helper scripts: `verify:backend`, `perf:login`, `db:inspect`. |

The only frontend file touched is `apps/web/src/pages/Login.tsx`: the identifier
field changed from `type="email"` to `type="text"` with
`autoComplete="username"` and the label "Email or username". Without it the
browser blocks usernames such as `cashier` before the request is ever sent;
layout, styling and behaviour are otherwise identical.

---

## B. Prisma migration summary

`20260921140000_auth_hardening_indexes` - additive and idempotent, safe against
live data (no `DROP`, no data rewrite):

| Statement | Reason |
| --- | --- |
| `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT` | Optional POS-friendly sign-in name. Nullable, so every existing account keeps working with email sign-in. |
| `CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key"` | Login by username; PostgreSQL permits any number of `NULL`s. |
| `CREATE INDEX IF NOT EXISTS "User_lastLoginAt_idx"` | "Recent sign-ins" reporting and account review. |
| `CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx"` | Pruning sessions that expired without being revoked. |
| `CREATE INDEX IF NOT EXISTS "ActivityLog_userId_createdAt_idx"` | Per-account audit trail (Admin > Logs filtered by user). |

Already present and kept: `User.email` (unique), `User(role, isActive)`
(role-first composite, serves role filters), `User.createdAt`,
`Session.refreshTokenHash` (unique), `Session(userId, revokedAt)`,
`ActivityLog(createdAt)`, `ActivityLog(action, createdAt)`,
`ActivityLog(entity, entityId)`, `Order(status, createdAt)`,
`Order(customerId, createdAt)`, `Order(driverId, status)`,
`OrderItem(orderId)`, `Product(categoryId)`, `Product(isArchived, isAvailable)`,
`Category(slug)`.

Deployment: `apps/api`'s `start` script already runs `prisma migrate deploy`
before booting, so the migration applies on the next Render deploy
(`DIRECT_URL` is used for migrations, `DATABASE_URL` for the running app).

---

## C. Seed summary

`npm run db:seed` → `apps/api/prisma/seed.ts`.

Default staff accounts (created only when absent - existing rows are **never**
modified, so a live admin keeps its password, role and activation state):

| Username | Email | Role | Protected | Default password |
| --- | --- | --- | --- | --- |
| `admin` | `admin@deliverysystem.app` | `ADMIN` | yes | `Admin@12345` |
| `cashier` | `cashier@deliverysystem.app` | `KITCHEN` | no | `Cashier@12345` |
| `inventory` | `inventory@deliverysystem.app` | `KITCHEN` | no | `Inventory@12345` |

Role mapping note: this platform ships four roles
(`CUSTOMER`, `KITCHEN`, `DRIVER`, `ADMIN`), so the POS "cashier" and "inventory
staff" accounts receive the operations (`KITCHEN`) role - the front-counter
dashboard. Promote the inventory account to `ADMIN` (Admin > Users, or the `role`
field of `STAFF_ACCOUNTS`) if that person must also manage the catalogue, stock
levels and prices.

Demo data (seeded only when `NODE_ENV !== 'production'` or with
`--with-demo-data`): `kitchen`, `driver` and `customer` accounts, the starter
catalogue and a demo address - each created only if missing.

```
npm run db:seed
npm run db:seed -- --admin-password="..." --cashier-password="..." --inventory-password="..."
npm run db:seed -- --link-usernames     # attach usernames to already existing default accounts
npm run db:seed -- --with-demo-data     # force the demo catalogue + demo accounts
```

Passwords are hashed with bcrypt at the configured work factor (`BCRYPT_ROUNDS`,
default 10) before they are written. Verified locally: the second consecutive run
created nothing and left every product, price and secret intact.

---

## D. Authentication summary

1. `POST /api/auth/login` accepts `{ email, password, rememberMe }` where `email`
   is an email address **or** a username (values containing `@` are looked up by
   email, everything else by username, case-insensitively).
2. **One** `SELECT` loads the account (indexed on `email` / `username`), then
   `bcrypt.compare` verifies the hash and the account must be active.
3. The session row and the `lastLoginAt` stamp are written in **one batched
   transaction**; the response carries the access JWT (sub, role, email,
   sessionId) plus the rotating refresh cookie.
4. The audit row (`LOGIN`) and - when the stored hash is more expensive than the
   configured cost - a background re-hash run *after* the response is built, so
   they add no latency. Existing cost-12 hashes are upgraded automatically on the
   next sign-in, so no password ever has to be reset.
5. There is **no** credential fallback anywhere: no environment username, email
   or password is read by any code path, and the `SEED_*` variables are gone.
6. `POST /api/auth/logout` revokes the session with a single `updateMany` using
   the identity carried by the verified token (no pre-flight `SELECT`), clears the
   CSRF and refresh cookies, and the token is dead immediately.
7. `POST /api/auth/refresh` revokes the used refresh token and stores its
   replacement in one round-trip.
8. Every protected request validates the session and the account in a single
   `Promise.all` round-trip (previously two sequential queries).

Measured on the same machine and database (`npm run perf:login`):

| Work factor | Login | Logout |
| --- | --- | --- |
| cost 12 (previous default) | 2375 / 1081 ms | 47 ms |
| cost 10 (new default) | 465 / 436 / 348 ms | 18 ms |

Production `api-run.log` before this change: `POST /api/auth/login 590-1270 ms`.
Root causes fixed: bcrypt cost 12 (~830 ms per compare), four serial database
round-trips per sign-in, an awaited audit write, two sequential queries per
protected request, and Render free-plan cold starts (see `keepalive.yml`).

---

## E. Settings summary (support phone)

* Storage: the existing `Setting` table (`key` unique, `value` JSON,
  `updatedById`, `updatedAt`). The support phone is one row, seeded by
  `prisma/seed.ts` from `DEFAULT_SETTINGS` only when the row does not exist.
* `GET /api/settings` - public, full storefront document (pricing, fees, contact).
* `GET /api/settings/support` - public, tiny support block:
  `{ businessName, supportPhone, supportEmail, updatedAt }`.
* `GET /api/settings/admin` - authenticated admin, full document.
* `PATCH /api/settings` - **admin only**, zod validated (`supportPhone` /
  `businessPhone` must be phone shaped, `supportEmail` / `businessEmail` must be
  valid emails), written in one batched transaction, cache invalidated
  immediately, `settings:changed` broadcast over Socket.IO, and a
  `SETTINGS_UPDATED` audit entry.
* No environment variable is involved, so a changed support number is live for
  every client on the next request - no redeploy.

Verified live: anonymous PATCH → 401, cashier PATCH → 403,
`supportPhone: "nope"` → 400, admin PATCH → the public endpoint returned the new
number on the very next request.

---

## F. Render environment variables (after this change)

Only these belong on the Render service (Environment tab). All of them are
*infrastructure* values; no account or support contact is configured here.

| Variable | Example | Required | Used for |
| --- | --- | --- | --- |
| `DATABASE_URL` | `postgresql://user:pass@host:6543/postgres?pgbouncer=true` | **Yes** | Pooled connection the API uses for every query |
| `DIRECT_URL` | `postgresql://user:pass@host:5432/postgres` | **Yes** | Non-pooled connection used by `prisma migrate deploy` at boot |
| `JWT_SECRET` | 32+ random characters | **Yes** | Signing access tokens (min 16 chars, keep it stable) |
| `NODE_ENV` | `production` | **Yes** | Production logging, secure cookies, staff-only seeding |
| `PORT` | `10000` | Recommended | Port the API listens on (Render injects it; 4000 is the fallback) |
| `API_PUBLIC_URL` | `https://delivery-2xbo.onrender.com` | Recommended | Absolute URLs for uploaded images, receipts and QR links |
| `APP_PUBLIC_URL` | `https://godspowergwd.github.io` | Recommended | CORS allowlist + links inside QR codes and receipts |
| `JWT_ACCESS_TTL` | `30m` | Optional | Access token lifetime (default `30m`) |
| `JWT_REFRESH_TTL` | `30d` | Optional | Refresh lifetime when "remember me" is off |
| `JWT_REMEMBER_TTL` | `90d` | Optional | Refresh lifetime when "remember me" is on |
| `BCRYPT_ROUNDS` | `10` | Optional | bcrypt work factor for new hashes (default 10) |

Removed - delete them from Render if they are still configured:
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_KITCHEN_EMAIL`,
`SEED_KITCHEN_PASSWORD`, `SEED_CUSTOMER_EMAIL`, `SEED_CUSTOMER_PASSWORD`,
`SUPPORT_PHONE`, `SUPPORT_EMAIL`, `BUSINESS_NAME`, `CURRENCY_CODE`,
`CURRENCY_SYMBOL`, `DELIVERY_FEE`, `TAX_RATE`, `MIN_ORDER_TOTAL`.

Render build/start commands stay as they are: `npm install && npm run build`
(build) and `npm start` (start) - the API start script runs
`prisma migrate deploy` first, which applies the new migration.



