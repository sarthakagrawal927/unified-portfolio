# Unified Portfolio

Read-only investment observability with private Google-authenticated workspaces. Cloudflare Workers runs the Next.js UI through vinext; Cloudflare D1 stores sessions, broker credentials and immutable canonical snapshots. No external database or sample-data mode.

Live: https://money.significanthobbies.com

**Google sign-in and live Zerodha and INDmoney reads are production-verified. Expired provider sessions preserve and clearly date the latest successful observations.** Work is tracked in [issue #1](https://github.com/sarthakagrawal927/unified-portfolio/issues/1).

## Development

Node 24+ and pnpm 10.33.2:

```sh
pnpm install
pnpm db:migrate:local
pnpm dev
```

Workers development runs at http://localhost:3040. Configure local Google credentials and encryption through protected developer configuration. Do not use production credentials for tests. Without Google configuration the sign-in page explains setup is pending; no invented holdings are shown. Synthetic fixtures exist only under tests.

```sh
pnpm check
pnpm test
pnpm build
```

Tests execute isolated local D1 databases via Miniflare. They cover atomic publication, sync leases, disconnect fencing, user isolation, Google token validation, PKCE, refresh rotation and per-user MCP revocation. `pnpm build:next` retains the original Next.js build for compatibility checks.

## Cloudflare deployment

Worker: `unified-portfolio`. D1: `unified-portfolio`. The checked-in Wrangler configuration identifies the account and database. `pnpm db:migrate` applies remote D1 migrations and `pnpm run deploy` publishes the built Worker; both require deployment authorization. The initial schema has been applied to the new remote database.

A Cron Trigger runs every 15 minutes. It refreshes eligible connections per user and records one daily portfolio observation after 17:00 IST. Existing provider expiry/rate-limit restrictions still apply. Daily values can include explicitly stale observations and do not imply a synchronized global market close.

The Worker uses request-scoped D1 sessions with the first read directed to the primary. Sync publication uses an atomic D1 batch and generation-conditional statements. Disconnect races cannot publish replacement data. Holdings, connections, daily history and sync receipts carry a user identity derived from Google's verified stable subject; no user ID is accepted from the browser.

## Authentication and secrets

Google signup is open to Google users once its OAuth application is configured for external production use. Every user receives an isolated workspace. The application requests only `openid email profile`.

| Configuration | Purpose |
| --- | --- |
| `DB` | Cloudflare D1 binding |
| `APP_ORIGIN` | Exact HTTPS origin |
| `TOKEN_ENCRYPTION_KEY` | Stable base64 encoding of 32 random bytes; provisioned as a Worker secret |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Dedicated Google OAuth web client |
| `ANGELONE_API_KEY` | Registered SmartAPI publisher application |
| `ANGELONE_LOCAL_IP`, `ANGELONE_PUBLIC_IP`, `ANGELONE_MAC_ADDRESS` | Actual SmartAPI-required network identity; never invent values |

Google callback: `/api/auth/google/callback`. Broker callbacks: `/api/providers/{zerodha,angelone,indmoney}/callback`, under `APP_ORIGIN`.

Google login uses one-use state bound to an HttpOnly cookie, PKCE S256, nonce validation, Google's signature keys, issuer/audience/expiry checks and verified email. Google tokens are not retained. A random HttpOnly Secure SameSite=Lax session cookie lasts 12 hours; its hash and encrypted identity persist in D1. Signing out deletes the session, while disconnecting a broker deletes its local authorization and preserves history.

Broker authorization is AES-256-GCM encrypted server-side. Never log callback URLs, request bodies, cookies or tokens. Worker observability capture is disabled and responses are no-store. App pages use same-origin referrers so browser form POSTs retain their Origin; auth/API responses use no-referrer. Cross-origin referrers remain suppressed. Preserve the encryption key across releases; key rotation needs a migration procedure. D1 restore drills remain unverified.

## Read-only MCP

Endpoint: `/mcp`. OAuth discovery is under `/.well-known`. Clients use exact HTTPS redirects, PKCE S256, the `/mcp` resource and `portfolio:read`. The signed-in user approves access to their own portfolio. Access lasts one hour; rotating refresh tokens last 30 days. Revocation is isolated to that user and epoch-fenced.

Tools: `portfolio_summary`, `get_holdings`, `get_holding`, `get_allocation`, `get_portfolio_history`, `get_performance`, `get_transactions`, `get_connection_status`. Every successful tool response includes `asOf`, `retrievedAt`, `dataState`, per-provider `lastSync`, freshness and coverage. Repeating a read returns the newest successfully stored snapshot without implying a broker refresh. Server instructions require compatible clients to disclose stale provider timestamps. No SQL, arbitrary provider proxy, trading operation or token passthrough is exposed.

## Remaining live acceptance

- Google project `fleet-unified-portfolio` exists. Google User Data Policy was accepted with owner approval and a web OAuth client created for https://money.significanthobbies.com/api/auth/google/callback. External publishing and Worker secrets are complete. Live Google consent, callback, session persistence and sign-out are verified.
- Zerodha uses the official hosted Kite MCP with no developer credentials. Connect opens official consent/login in a new tab; return to Accounts and choose Finish Zerodha connection. Pending sessions are encrypted, tenant/browser-session bound and expire after 10 minutes. Authenticated refresh reuses the server-side MCP session. Only profile, equity holdings, mutual fund holdings and margins reads are allowed. Session expiry requires reconnect. Real hosted login, 23 Zerodha holdings, INR cash and a subsequent refresh without reauthentication are verified in production. After expiry, the latest successful snapshot remains visible with its exact sync date.
- INDmoney imports all 16 asset categories using read-only MCP calls. Encrypted tenant-scoped staging preserves completed categories across rate limits, with retry time and progress shown on Accounts. Complete category sets publish atomically; missing quantities and costs remain unknown. USD uses native USD valuations. Retrieval timestamps do not assert that underlying linked investments were updated at that time.
- No cash or transaction ingestion, true investment returns, FX consolidation, verified sector classification or financed-equity valuation. INR and USD remain separate; unknown basis remains unknown. Derivative positions never inflate holdings value with notional exposure.
- INDmoney observations are visible when no direct broker snapshot exists. A direct broker snapshot takes precedence over its linked INDmoney observations; unknown-custody observations in overlapping currencies are conservatively excluded and disclosed. This can undercount multi-account portfolios until custody reconciliation is available.
- ChatGPT OAuth installation and live MCP portfolio reads are verified. OAuth token refresh after expiry, a fresh Claude/Codex connection and database restore remain unverified.

Prior pre-deployment Postgres design files are retained under `docs/archive/` only. They are not runtime dependencies or production migrations.

INDmoney scope is configurable in Settings per user. USD scope includes only US_STOCK retrieval; direct broker coverage is unchanged. USD wallet valuation is read from networth_snapshot’s US_STOCK_WALLET entry. The provider does not supply native USD wallet cash in that response. We show an explicitly estimated USD value using the implied FX rate from matching provider stock valuations, preserving source value and rate. Missing or inconsistent inputs remain Unavailable. Wallet value is not verified withdrawable cash or buying power.

MCP current-data tools accept the stored `owner_label`; `get_allocation` supports dimension owner. Historical tools remain combined-owner. The deployed OAuth MCP has automated protocol/security coverage and prior ChatGPT end-to-end acceptance.
