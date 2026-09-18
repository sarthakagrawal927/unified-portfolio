# Project status

September 12, 2026: deployed to Cloudflare Workers at https://money.significanthobbies.com. Worker `unified-portfolio`, D1 `unified-portfolio` (`bd1a2b65-7ab1-4ded-93f4-bfb2c3ca127f`), initial schema applied, encryption Worker secret provisioned, cron every 15 minutes. Current deployment version: `fb28c131-7ae4-4cf5-9547-561db0b635bd`.

Custom domain HTTPS verified: GET / redirects to /settings, returning HTTP 200.

## Verified

23 tests pass including isolated D1 execution, atomic sync publication, two-user data isolation, per-user MCP revocation, Google token verification, PKCE and refresh rotation. TypeScript and Workers production build pass. Live browser opens the Google sign-in/setup surface; signed-out portfolio pages redirect to Settings. No sample data exists in runtime code.

## Google signup

User requested public Google signup with private portfolios, replacing the original single-owner model. Google identity project `fleet-unified-portfolio` was created in the signed-in console. Consent branding is filled in with external audience. Google API Services User Data Policy accepted with owner approval. Web OAuth client created with the custom-domain callback. External audience is now In production and both Google Worker secrets are installed. Live Google button is visible; server login initiation returns 303 to Google. Fixed Workers encryption input encoding and added a Workers-runtime regression test. Automated Chrome navigation reports ERR_BLOCKED_BY_CLIENT; real callback/session verification awaits a normal-browser login. Signed-out visitors see no dashboard navigation.

## Remaining acceptance

Live Zerodha/Angel One integration, INDmoney response mapping, ChatGPT connection and restore verification remain open. Broker application configuration is absent. Cash, transactions, FX and true returns are unavailable and disclosed. This is a deployed foundation, not a completed V1.

See README and https://github.com/sarthakagrawal927/unified-portfolio/issues/1.

## Live Google acceptance completed

Google signup, consent, callback, authenticated Accounts view, reload persistence, sign-out and signed-out route protection verified in Chrome. Fixed two production issues: no-referrer caused null Origin on HTML form POSTs, and Workers rejects redirect:error fetch mode. Pages now use same-origin referrer policy; auth/API responses retain no-referrer. Manual upstream redirects are never followed. Sanitized live request logs confirmed Origin classification and 403/303 outcomes without recording cookies, codes or tokens. 23 tests pass; check and production build pass. Broker integration and MCP end-to-end acceptance remain incomplete.

## INDmoney runtime diagnosis — September 13, 2026

OAuth succeeded. Fixed MCP tool-output schema caching failing under Workers dynamic-code restrictions by using the SDK Cloudflare validator. Added a Miniflare regression using the real client. All 24 tests, TypeScript and production build pass. Live tool discovery and real holdings reads succeeded, but complete multi-asset import is unfinished and upstream tool limits were observed. No financial values were published. Accounts explicitly shows Connected · import pending; reconnecting is not a remedy. Refresh now reports failed/skipped outcomes accurately. Full canonical multi-asset mapping, identity reconciliation and budget-aware retrieval remain necessary before sync acceptance.

## INDmoney import shipped — September 13, 2026

All 16 read-only asset-category responses now normalize and publish atomically. Encrypted tenant-scoped staging resumes across provider rate limits; Accounts shows count and retry time. Missing quantities and text cost placeholders remain unknown; USD uses native values. Provider identifiers remain source-scoped unless a verified ISIN is supplied. Direct-broker observations take precedence only when that direct snapshot exists; unresolved overlapping custody stays conservatively excluded. Retrieval-time and linked/manual asset limitations are disclosed.

Live Chrome proof: existing Google and INDmoney authorizations reused without reconnect; import resumed from 14/16 categories and completed successfully; Accounts showed Connected and 1/3 accounts current, Holdings rendered 33 real rows, Overview rendered separate INR and USD values and allocations. No balances or credential values were copied into project documentation. All 28 tests, TypeScript and Workers build pass. Deployment version 9b365693-351d-49f5-8fc3-e4b7fe7e2606. Source remains uncommitted/unpushed. Zerodha/Angel One acceptance, custody reconciliation, true returns, full history and external MCP acceptance remain separate open V1 work.

## INDmoney USD scope — September 13, 2026

INDmoney scope saved per user to USD; live refresh and 13 USD holdings verified in Chrome, with no INDmoney INR rows. Zerodha and Angel One scope retained; app registration still required. USD wallet cash remains unavailable and unknown, never zero. 30 tests pass. Encrypted per-user preference applies to dashboard and shared read model; USD import requests only US_STOCK. Snapshot currency scope and retrieval semantics remain explicit. Historical views select matching scope; original stored history is retained. Deploy 4e4da79c-724f-4604-84cc-c817f4291089. TypeScript and production build passed.

## Owner labels and MCP status — September 13, 2026

Editable per-user owner labels deployed on Accounts and holdings. Current MCP summary, holdings, instrument, allocation and connection tools accept owner_label; allocation also supports owner. Live label save verified. 31 tests pass. MCP unauthenticated POST returns 401. External ChatGPT OAuth and query acceptance remain unverified. Labels organize providers within one authenticated workspace, without granting access or altering account ownership. Historical tools explicitly return combined-owner history, not owner-specific performance. Missing cash remains unavailable. TypeScript and production build pass. Deploy 7a5777a2-d122-46e9-bd5e-2b98b34fda95.

## Wallet valuation and broker setup audit — September 13, 2026

INDmoney US_STOCK_WALLET discovered in authenticated networth_snapshot. Dashboard and MCP now include a clearly marked USD estimate, converted using provider-implied FX only when the stock valuations match across responses. Native USD wallet balance is not supplied by the checked response. Live refresh and cash-inclusive overview verified. 33 tests pass. Source amount, implied rate, wallet classification and estimate flag are retained; wallet value is not asserted as withdrawable cash or buying power. Missing or inconsistent conversion inputs remain unknown. Temporary source-contract diagnostics removed from the adapter and schema. TypeScript and Workers build pass. Deployed 439daca4-0dfd-4da4-85af-e3b0d494b9fa.

Kite MCP public tool discovery verified login/get_holdings/get_margins without developer credentials; live upstream also exposes write tools. No switch or authorization performed: any future adapter must strictly allowlist reads and validate session persistence. Angel One current SmartAPI route requires app configuration; no live login/holdings acceptance. Unconfigured connection buttons now explicitly say setup needed.

September 13, 2026: Replaced broken Angel One /create setup link with official SmartAPI homepage. Verified homepage login opens publisher-login/v2/login, and deployed accounts dialog points to the corrected URL. 33 tests, typecheck, build passed. Deployment 36370097-d364-4fa4-b6a7-f99ef91cff4d. Broker authentication remains pending.

## Zerodha MCP — September 13, 2026
Replaced Kite API-key setup with hosted Kite MCP. Official consent reached from deployed Accounts; waiting for user login to validate account import. Pending session encrypted and bound to tenant/browser session, expires after 10 minutes; explicit finish verifies profile before saving authorization with generation fence. SDK resumes same MCP session across requests. Tool allowlist restricts calls to profile, equity/MF holdings and margins. Cash uses enabled segments available.live_balance, never collateral-inclusive net; net positions remain explicitly unavailable because upstream combines day and net rows. Fixed live CSRF failure from noreferrer form and Workers rejection of redirect:error; CSRF enforcement and strict redirect rejection retained. Added six tests including Workers runtime and resumed-session retry; all executed checks pass. Deploy 2e278b26-2577-446f-bf4a-65763e218e6e. No developer app created, no keys, dependencies or migrations added.

### Zerodha live acceptance — September 13, 2026
Zerodha official MCP login completed in Chrome. Finish connection succeeded; a separate Refresh succeeded without reauthentication. Holdings page shows 23 real Zerodha rows, combined 36 rows with the existing 13 INDmoney USD holdings. Overview shows INR cash and holdings, separate USD totals, owner label Mine, and 2/3 accounts current. Net positions remain explicitly unavailable; cash is reported available.live_balance, not verified withdrawable funds. No developer app or API keys were needed. Deployment remains 2e278b26-2577-446f-bf4a-65763e218e6e.

## September 13: consolidated Overview and ChatGPT setup

Removed separate Performance navigation and redirected /performance to Overview. Overview preserves separate USD and INR daily history and explicitly distinguishes observed value from investment return. Production browser deep link and both currency histories verified. All 39 tests, TypeScript and build pass. Deployed d3cae1f5-27cc-4626-9fea-f7c86b3de4c5; source remains local and uncommitted/unpushed.

Created Unified Portfolio custom connector in signed-in ChatGPT. OAuth discovery resolved authorization, token, registration and resource URLs and portfolio:read scope. DCR succeeded and reached the correct Google-session-bound read-only consent page. Owner approved read-only access. Google-session-bound consent completed, ChatGPT installed the connector with OAuth, and Refresh discovered all eight read-only actions. Live ChatGPT conversation successfully retrieved portfolio summary, connection status and holdings; final response verified 23 Zerodha and 13 INDmoney holdings, separate INR/USD cash, explicit USD wallet estimate and unavailable Angel One data. Verification conversation: https://chatgpt.com/c/6aa69215-6298-83ee-b38b-fff64b04ef03. Token refresh after expiry has not yet been time-tested. Existing eight owned product plugins are installed; this is installation evidence, not a fresh functional test of every product.

## September 13: personal portfolio scope

Owner dropped Angel One. Active providers are now Zerodha and INDmoney only. Removed Angel One from provider routing, scheduled adapters, current snapshots, connection health and MCP current data. Removed owner-label editor and Angel One setup prompts. Existing stored observations and schema compatibility remain; no data migration or credential changes. Live Accounts verified 2/2 accounts current with only Zerodha and INDmoney. All 39 tests, TypeScript and build passed. Deployed c8b5d4fc-df50-491f-9f3f-3e2d3b8a42f5; source remains uncommitted.

## Latest stored snapshot release — September 19, 2026

Expired provider consent no longer leaves freshness implicit. Overview and Holdings explicitly label retained values with the provider's exact last successful sync time in IST and state that those values are not current market data. The read-only MCP response now adds `retrievedAt` and `dataState`, retains per-provider `lastSync`, and supplies server instructions requiring Claude, Codex and other compatible clients to disclose stale dates. Repeating an MCP read returns the newest successfully stored snapshot but never claims to refresh an expired broker session.

Production storage was inspected read-only before release: 24 Zerodha provider snapshots, 319 INDmoney provider snapshots and six combined daily snapshots were present. The staged first repository revision passed a zero-finding Gitleaks scan. All 39 tests, TypeScript, formatting and the Workers build passed. No migration or credential change was performed. Deployed Worker version `fb28c131-7ae4-4cf5-9547-561db0b635bd`.
