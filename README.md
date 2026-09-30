# Velora — Digital Wallet & Payment Platform

A production-style wallet platform with a React + TypeScript customer interface and a Node.js, Express, PostgreSQL, and Redis backend. It uses a strict double-entry ledger. Monetary values are always represented as integer strings in minor units; JavaScript floating-point numbers never enter the accounting path.

## Architecture

```text
Client
  |
  v
Express route -> Handler -> Service -> Repository -> PostgreSQL
     |                         |
     |                         +-----> PaymentProvider interface
     +-> auth/rate limits             (simulated locally)
     |
     +-> Redis response cache
           |
           +-> PostgreSQL idempotency record remains authoritative

Money transaction (one PostgreSQL transaction)
  1. Claim and lock Idempotency-Key
  2. Lock all affected accounts in sorted UUID order
  3. Check available cached balance
  4. Insert transaction
  5. Insert debit (< 0) and credit (> 0) entries
  6. Database trigger updates cached balances
  7. Deferred database trigger verifies SUM(entries.amount) = 0
  8. Persist original HTTP response and commit atomically
```

## Accounting model

- `entries` is the immutable source of truth.
- Every movement has at least one debit and one credit.
- Signed entry amounts for a transaction must sum to zero.
- PostgreSQL deferred constraint triggers reject unbalanced transactions at commit.
- `accounts.balance` is only a cache updated by an entry-insert trigger.
- Wallet reads independently derive the balance from ledger entries and detect cache drift.
- All amounts use PostgreSQL `BIGINT` and API strings such as `"2500"` ($25.00).

### Examples

```text
Deposit 1000:
  External Funding  DEBIT   -1000
  User Wallet       CREDIT  +1000
                             -----
                                 0

P2P transfer 400:
  Sender Wallet     DEBIT    -400
  Receiver Wallet   CREDIT   +400
                             -----
                                 0
```

## Main features

- Signup creates the user and wallet atomically.
- bcrypt password hashing with configurable work factor.
- Short-lived JWT access tokens.
- Rotating JWT refresh tokens stored as SHA-256 hashes.
- Single-use, expiring password-reset links with hashed tokens and full session revocation.
- Ledger-derived wallet balances.
- Deposits and withdrawals behind a replaceable payment-provider interface.
- P2P transfers with deterministic row-lock ordering.
- PostgreSQL-backed idempotency with Redis as an acceleration cache.
- Paginated statements filtered by type and date.
- Zod request/configuration validation.
- Pino structured logging and request correlation IDs.
- Helmet, CORS, global/auth/money endpoint rate limits.
- OpenAPI 3.1 and Swagger UI.
- Graceful shutdown and dependency readiness checks.
- Jest unit tests and Testcontainers integration/concurrency tests.
- Responsive React wallet dashboard with signup, login, token refresh, deposits, transfers, withdrawals, statements, and analytics.

## Prerequisites

- Node.js 22+
- Docker Desktop with Docker Compose

## Setup

```bash
npm install
cp .env.example .env
docker compose up -d --wait
npm run db:migrate
npm run dev
```

The server listens at `http://localhost:3000`.

- Liveness: `http://localhost:3000/api/v1/health/live`
- Readiness: `http://localhost:3000/api/v1/health/ready`
- Swagger: `http://localhost:3000/api-docs`
- OpenAPI JSON: `http://localhost:3000/api-docs.json`

The server also runs pending migrations safely at startup. The standalone migration command is useful in CI/CD.

To run the production multi-stage Docker image together with its infrastructure:

```bash
docker compose --profile application up --build -d --wait
```

Then open the customer wallet interface at `http://localhost:8080`. The API and Swagger remain available on port 3000.

For frontend-only development with hot reload:

```bash
cd frontend
npm install
npm run dev
```

The development UI runs at `http://localhost:5173` and talks to the API at port 3000. The browser stores the current demo session in local storage; production fintech applications should prefer secure, HttpOnly cookies for refresh tokens.

## Netlify frontend deployment

The root `netlify.toml` configures Netlify to install and build the React app in `frontend/` and publish `frontend/dist/`. The root package builds only the Express backend and does not produce an HTML page, so it must not be used as the Netlify site's build target. A single-page app fallback serves `index.html` when opening or refreshing frontend routes.

The deployment command explicitly installs the frontend's locked dependencies, including development dependencies, before compiling. This ensures React, Vite, TypeScript, and React type declarations are available even when deployment starts with only the backend's dependencies installed.

This deployment hosts the frontend only. Set `VITE_API_URL` in the Netlify site's build environment to the HTTPS origin of your deployed Express API, and allow the Netlify site's origin in the API's `CORS_ORIGINS` setting. Redeploy after changing `VITE_API_URL`, because Vite includes it at build time. Without it, the frontend sends API requests to its own origin, where this static deployment does not provide the wallet API.

## Free public demo deployment

The repository includes a Render Blueprint that deploys the React UI and Express API at one public HTTPS URL, plus free PostgreSQL and Redis-compatible Key Value services in Singapore.

1. Push the latest commit to GitHub.
2. Open [Deploy Velora on Render](https://dashboard.render.com/blueprint/new?repo=https://github.com/NischeDev/velora-wallet-platform).
3. Sign in with GitHub, grant Render access to `NischeDev/velora-wallet-platform`, and choose **Apply**.
4. Wait for all three resources to become available, then open the `velora-wallet-platform` web service URL.

The server runs database migrations automatically during startup. Render generates the JWT secrets and injects the database and Key Value connection strings, so secrets are not committed to Git.

This free deployment is suitable only for a portfolio demo. Render free web services sleep after 15 minutes of inactivity, free PostgreSQL expires after 30 days, and free Key Value data can be lost on restart. The deployment uses simulated money and is not an RBI-authorised wallet or live payment system.

### Enable password-reset email

Password-reset tokens are opaque, stored only as SHA-256 hashes, expire after 15 minutes, and can be used once. Completing a reset increments the user's authentication version and revokes every access and refresh token issued before the password change.

Email delivery is disabled by default so the application never leaks reset links into production logs. To enable it:

1. Create a Resend account and verify a domain or sending subdomain.
2. Create a sending API key.
3. In Render, open `velora-wallet-platform` → **Environment** and add:

```dotenv
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_replace_with_your_secret
EMAIL_FROM=Velora <security@your-verified-domain.example>
PUBLIC_APP_URL=https://velora-wallet-platform.onrender.com
```

4. Save the environment changes and let Render redeploy the service.

For local-only testing, set `EMAIL_PROVIDER=console`. The reset URL is written to the structured development log. Console delivery is rejected when `NODE_ENV=production`.

## India payment sandbox

The application supports two provider modes:

- `simulated`: local deposits and withdrawals with no external account.
- `razorpay`: Razorpay Test Mode Checkout for INR deposits through simulated UPI, cards, and netbanking.

Razorpay deposits use a server-created provider order. A browser success callback never credits the wallet by itself. The backend verifies the HMAC signature, fetches the payment from Razorpay, confirms that it is captured and matches the stored amount, currency, and order, and atomically creates the double-entry ledger transaction. Repeated verification returns the existing transaction.

Generate Test Mode keys in the Razorpay Dashboard and update only your local `.env`:

```dotenv
DEFAULT_CURRENCY=INR
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=rzp_test_replace_me
RAZORPAY_KEY_SECRET=replace_me
```

Never commit `.env` or expose `RAZORPAY_KEY_SECRET` in frontend code. Restart after changing configuration:

```bash
docker compose --profile application up --build -d --wait
```

The optional `/api/v1/webhooks/razorpay` endpoint validates raw-body signatures and deduplicates events by `X-Razorpay-Event-Id`. Razorpay cannot deliver webhooks directly to localhost, so the immediate signed Checkout verification is used for this local portfolio workflow; webhook behavior is covered locally by tests.

This sandbox does not use real money and is not an RBI-authorised PPI. RazorpayX bank payouts are deliberately disabled when Razorpay Checkout is enabled; payout states, reversals, beneficiary verification, and reconciliation are a separate phase.

## API walkthrough

### 1. Create Alice

```bash
curl -X POST http://localhost:3000/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "alice@example.com",
    "fullName": "Alice Wallet",
    "password": "correct-horse-battery-staple"
  }'
```

Save `data.accessToken` and `data.refreshToken` from the response.

```bash
export ALICE_TOKEN='paste-access-token'
```

### 2. Create Bob

```bash
curl -X POST http://localhost:3000/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "bob@example.com",
    "fullName": "Bob Wallet",
    "password": "correct-horse-battery-staple"
  }'
```

### 3. Deposit $100.00 into Alice's wallet

```bash
curl -X POST http://localhost:3000/api/v1/wallet/deposits \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: alice-deposit-0001' \
  -d '{"amountMinor":"10000","description":"Initial funding"}'
```

Repeat the exact request. It returns the original transaction and the header:

```text
Idempotent-Replayed: true
```

Reusing the key with a different amount returns `409 IDEMPOTENCY_KEY_REUSED`.

### 4. Transfer $25.00 to Bob

```bash
curl -X POST http://localhost:3000/api/v1/wallet/transfers \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: alice-transfer-0001' \
  -d '{
    "recipientEmail":"bob@example.com",
    "amountMinor":"2500",
    "description":"Dinner split"
  }'
```

### 5. Withdraw $10.00

```bash
curl -X POST http://localhost:3000/api/v1/wallet/withdrawals \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: alice-withdraw-0001' \
  -d '{"amountMinor":"1000"}'
```

### 6. Read balance and statement

```bash
curl http://localhost:3000/api/v1/wallet \
  -H "Authorization: Bearer $ALICE_TOKEN"

curl 'http://localhost:3000/api/v1/wallet/transactions?page=1&pageSize=20&type=TRANSFER' \
  -H "Authorization: Bearer $ALICE_TOKEN"

curl 'http://localhost:3000/api/v1/wallet/analytics' \
  -H "Authorization: Bearer $ALICE_TOKEN"
```

Date filters accept ISO-8601 timestamps:

```text
?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.999Z
```

### 7. Refresh the session

```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"paste-refresh-token"}'
```

Refresh tokens rotate. A successfully used token cannot be reused.

## Response format

Success:

```json
{
  "success": true,
  "data": {},
  "meta": { "requestId": "request-correlation-id" }
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "The wallet does not have enough available funds"
  },
  "meta": { "requestId": "request-correlation-id" }
}
```

## Database migrations

Migration files live in `migrations/`. The runner:

- Acquires a PostgreSQL advisory lock so only one instance migrates at a time.
- Executes each migration in a transaction.
- Stores a SHA-256 checksum.
- Refuses to run if an already-applied migration was edited.

Never edit an applied migration in a shared environment. Add a new numbered migration.

## Testing

```bash
npm run test:unit
npm run test:integration
npm test
npm run smoke
```

Integration tests start isolated PostgreSQL and Redis containers. They verify:

- Complete auth/deposit/transfer/withdrawal flow.
- Duplicate idempotent requests do not double-credit.
- Concurrent overspending allows only one affordable transfer.
- Every transaction remains balanced.
- Ledger entries reject updates.

If the host sandbox does not expose Docker to Node directly, run the isolated suite through the test profile:

```bash
docker compose --profile test run --rm test
```

Quality gates:

```bash
npm run format:check
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev
```

## Production considerations

The local payment provider is deterministic and simulated. A production provider integration should use provider-side idempotency, signed webhooks, an inbox/outbox pattern, and asynchronous reconciliation. Do not keep a long database transaction open across a slow external HTTP call.

Deployments should also use:

- A managed secret store instead of `.env` files.
- TLS for PostgreSQL and Redis.
- Separate database roles and least-privilege grants.
- Centralized logs, metrics, traces, and alerts.
- Automated ledger reconciliation and backup restoration drills.
- Multi-currency system accounts added through migrations.

## Resume bullet points

- Built a TypeScript/Express digital wallet API backed by an immutable PostgreSQL double-entry ledger with deferred balance constraints and `BIGINT` minor-unit money handling.
- Implemented atomic P2P transfers using deterministic `SELECT ... FOR UPDATE` locking, balance checks, and transaction-scoped ledger writes to prevent race-condition overspending.
- Designed PostgreSQL-authoritative idempotency with Redis response caching, concurrent duplicate-request serialization, and request-payload conflict detection.
- Added bcrypt/JWT authentication with rotating hashed refresh tokens, structured Pino logging, Zod validation, rate limiting, Swagger docs, and Testcontainers concurrency tests.
