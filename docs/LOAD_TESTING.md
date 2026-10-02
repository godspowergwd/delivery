# Isolated Load Testing

The load harness refuses remote databases, the ordinary `delivery_system`
development database, production/test runtime modes, missing mock-map mode,
configured external provider credentials, non-synthetic accounts, and missing
write confirmation. `npm run load:preflight` checks local configuration only; it
does not send HTTP requests or open database connections.

## Isolated Environment

Use a dedicated local PostgreSQL database named `delivery_loadtest` (or another
explicit `_loadtest` / `_test` database). Do not point this workflow at Supabase,
Render, Neon, a production URL, or the general `.pgdata` database named
`delivery_system`. The existing `scripts/dev-db.mjs` helper has a destructive
`reset` command and defaults to `delivery_system`; reset is disabled and must
not be used for this workflow. Developer migrate, push, and seed commands refuse
remote or production URLs.

Configure the ignored `apps/api/.env` for the dedicated database only:

```dotenv
NODE_ENV=development
LOAD_TEST_ENV=isolated
DATABASE_URL="postgresql://<local-user>:<local-password>@127.0.0.1:5433/delivery_loadtest"
DIRECT_URL="postgresql://<local-user>:<local-password>@127.0.0.1:5433/delivery_loadtest"
MAPBOX_MOCK=true
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET_NAME=""
SEED_ADMIN_PASSWORD=""
SEED_CASHIER_PASSWORD=""
SEED_INVENTORY_PASSWORD=""
SEED_KITCHEN_PASSWORD=""
SEED_DRIVER_PASSWORD=""
SEED_CUSTOMER_PASSWORD=""
```

Do not include Mapbox, R2, SMS, Hubtel, or payment-provider credentials in this
isolated API environment. The repository currently has no outbound SMS or
payment-provider client; notification records and Socket.IO events are local to
the API/database. Mock Mapbox is enforced by the server health attestation.

Apply existing migrations only after independently verifying both database URLs
are local and point to `delivery_loadtest`. Do not use `db:push`, `db:reset`, or
the production startup command. Do not copy production data into this database.
Provision synthetic accounts in this isolated database through the approved
local bootstrap/admin workflow. Use one unique account per virtual user, with
the `@loadtest.invalid` domain and customer, driver, kitchen, and admin roles
represented. A 500-user run therefore requires at least 500 such accounts; do
not reuse real, default seeded, or production accounts.
For runs of eight or more, at least 60% must be customers and at least 10% each
must be drivers, kitchen staff, and admins.

Set their credentials in the ignored `apps/api/.env` as JSON. The runner never
prints passwords or sends the role field to the API:

```dotenv
LOAD_TEST_ACCOUNTS_JSON='[{"email":"customer-001@loadtest.invalid","password":"<synthetic-password-12-plus>","role":"CUSTOMER"},{"email":"driver-001@loadtest.invalid","password":"<synthetic-password-12-plus>","role":"DRIVER"},{"email":"kitchen-001@loadtest.invalid","password":"<synthetic-password-12-plus>","role":"KITCHEN"},{"email":"admin-001@loadtest.invalid","password":"<synthetic-password-12-plus>","role":"ADMIN"}]'
```

That four-account example is sufficient only for a four-user preflight/workload
using matching `--users=4` arguments. The default preflight and 500-user command
require 500 configured accounts.

## Read-Only Smoke Verification

After independently confirming the isolated API and database settings, start the
API with the development command and run the guarded smoke checks:

```powershell
$env:SMOKE_BASE_URL = 'http://127.0.0.1:4100/api'
node scripts/smoke.mjs --allow-writes=true --confirm-isolated-test-env=YES
```

The smoke runner requires the same isolated database, mock-provider, synthetic
account, and fresh runtime-attestation gates as the load harness. It checks
liveness/readiness and role-scoped reads, then logs out each synthetic session.
Login creates session rows in the disposable database; the runner does not
create customer accounts, orders, uploads, or settings changes.

The API process and harness must inherit the same isolated environment. Start the
API with the development command only after confirming its `.env` values. After
binding its port, the API writes a secret-free PID/port/runtime attestation to an
ignored `.load-test-runtime-<port>.json` file. `npm run load:preflight` checks
that file locally, without HTTP or database connections. The workload runner
validates the same attestation before its first HTTP request; it must be no more
than five minutes old and its recorded process must still be alive. The runner
then checks the API liveness endpoint before virtual users start. Restart the
isolated API immediately before the preflight/workload if the attestation expired.

## Run

```powershell
npm run load:preflight
npm run load:500 -- --allow-writes=true --confirm-isolated-test-env=YES
```

The second command is intentionally opt-in. Do not add those flags to the npm
script. A 500-user run requires 500 unique synthetic accounts. The test creates
synthetic orders and notification records in the
disposable database. It does not upload files or call external notification,
payment, or geocoding services. The preflight command itself never contacts the
API or database.

Cloudflare Pages is configured in `apps/web/wrangler.jsonc`; no Render service
manifest is present in this repository. Production proxy hop counts, environment
secrets, and database URLs must be confirmed in the hosting dashboards, not
inferred from this local setup.