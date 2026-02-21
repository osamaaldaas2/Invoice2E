# Security Decisions & Accepted Risks

**Last updated:** 2026-02-19
**Audit source:** [SECURITY-AUDIT-REPORT-2026-02-18.md](../SECURITY-AUDIT-REPORT-2026-02-18.md) (83 findings)
**Review cadence:** Quarterly or after any architecture change

---

## Status Summary

| Category                                         | Count |
| ------------------------------------------------ | ----- |
| Fixed (code changes)                             | 48    |
| Accepted risks (documented below)                | 17    |
| Informational (P4-INFO, no action)               | 9     |
| Addressed by feature flags (progressive rollout) | 9     |

---

## Accepted Risks

### AR-1: No CSRF Tokens on State-Changing Routes

| Field       | Value           |
| ----------- | --------------- |
| Finding     | #3 (P1-HIGH)    |
| Location    | `middleware.ts` |
| Review date | 2026-05-19      |

**Risk:** State-changing POST/PUT/DELETE API routes do not use CSRF tokens.

**Mitigations in place:**

- `sameSite: 'lax'` on session cookies prevents cross-origin POST submissions
- CORS origin validation rejects requests from unauthorized origins
- All API routes require authenticated session (cookie-based HMAC token)
- `Content-Type: application/json` requirement prevents form-based CSRF (browsers don't send JSON from forms)

**Conditions to revisit:** If the app adds form-based actions, `sameSite: 'none'`, or cross-origin cookie sharing.

---

### AR-2: No Dependency Injection Container

| Field       | Value           |
| ----------- | --------------- |
| Finding     | #14 (P2-MEDIUM) |
| Location    | Codebase-wide   |
| Review date | 2026-08-19      |

**Risk:** Services use module-level singleton exports instead of a DI container. This creates tight coupling and makes integration testing harder.

**Rationale:** The current codebase is small enough that explicit imports provide sufficient clarity. A DI container adds complexity without proportional benefit at this scale.

**Conditions to revisit:** If the service count exceeds 20 or integration test mocking becomes a recurring pain point.

---

### AR-3: Random Per-Process Session Secret in Development

| Field       | Value                  |
| ----------- | ---------------------- |
| Finding     | #17 (P2-MEDIUM)        |
| Location    | `lib/session.ts:34-38` |
| Review date | N/A (by design)        |

**Risk:** Dev mode generates a random session secret per process, so sessions don't persist across restarts.

**Rationale:** This is a deliberate security improvement (FIX: Audit #008). The alternative — a deterministic fallback secret — would allow any developer to forge sessions. Random-per-process is the safer default. Production enforces `SESSION_SECRET` via a hard `throw`.

**Conditions to revisit:** None. This is the intended behavior.

---

### AR-4: 7-Day Session TTL

| Field       | Value               |
| ----------- | ------------------- |
| Finding     | #18 (P2-MEDIUM)     |
| Location    | `lib/session.ts:15` |
| Review date | 2026-05-19          |

**Risk:** 7-day session lifetime is long for a financial application. NIST recommends shorter sessions for sensitive data.

**Mitigations in place:**

- Sliding window renewal after 3.5 days (half-TTL) forces re-issuance
- Session tokens are HMAC-SHA256 signed (cannot be forged)
- `aud` claim validation prevents cross-deployment token reuse
- All tokens have explicit `expiresAt` checked on every request

**Conditions to revisit:** If the app handles payments directly (not via Stripe/PayPal redirect) or if regulatory audit requires shorter sessions.

---

### AR-5: sameSite 'lax' on Session Cookies

| Field       | Value                |
| ----------- | -------------------- |
| Finding     | #19 (P2-MEDIUM)      |
| Location    | `lib/session.ts:202` |
| Review date | 2026-05-19           |

**Risk:** `sameSite: 'lax'` sends cookies on top-level GET navigations from external sites. This allows GET-based CSRF if any GET route has side effects.

**Mitigations in place:**

- No GET routes perform state-changing operations
- All mutations use POST/PUT/DELETE with JSON body
- CORS origin validation as additional layer

**Conditions to revisit:** If any GET route is added that performs mutations (e.g., one-click actions via URL).

---

### AR-6: In-Process Session Profile Cache

| Field       | Value                    |
| ----------- | ------------------------ |
| Finding     | #20 (P2-MEDIUM)          |
| Location    | `lib/session.ts:298-299` |
| Review date | 2026-08-19               |

**Risk:** `fetchSessionProfile()` uses an in-memory `Map` cache with 5-minute TTL. In multi-instance deployments, profile changes (e.g., role update) take up to 5 minutes to propagate.

**Rationale:** The app currently runs as a single instance. The cache prevents a DB query on every authenticated request.

**Conditions to revisit:** When deploying to multi-instance (Kubernetes, multiple Vercel regions). Replace with Redis or remove the cache.

---

### AR-7: Admin Client Bypasses RLS

| Field       | Value                          |
| ----------- | ------------------------------ |
| Finding     | #21 (P2-MEDIUM)                |
| Location    | `lib/supabase.server.ts:27-46` |
| Review date | 2026-05-19                     |

**Risk:** `createAdminClient()` uses the service role key, bypassing Row-Level Security. Any code path using it has access to all tenants' data.

**Mitigations in place:**

- Admin client is only used for: credit operations (atomic RPCs), session profile lookup, admin-only endpoints
- All user-facing data queries use `createUserScopedClient()` with RLS
- Audit logs track all admin client usage (via request context)

**Conditions to revisit:** If new code paths use admin client for user-facing queries. Grep for `createAdminClient` periodically.

---

### AR-8: Feature-Flagged Modules (XState, RBAC, Encryption, Retention, Outbox)

| Field       | Value                           |
| ----------- | ------------------------------- |
| Findings    | #23, #24, #43, #65, #77 (P2-P4) |
| Location    | Various `USE_*` flags           |
| Review date | 2026-05-19                      |

**Risk:** Several modules are behind feature flags (default OFF):

- `USE_STATE_MACHINE` — XState invoice lifecycle
- `USE_GRANULAR_RBAC` — CASL permission checks
- `USE_FIELD_ENCRYPTION` — envelope encryption for PII
- `USE_DATA_RETENTION` — automated data retention/deletion
- `USE_OUTBOX` — transactional outbox pattern
- `USE_AUDIT_HASH_VERIFY` — hash chain verification
- `USE_FILE_QUARANTINE` — file scanning
- `USE_CIRCUIT_BREAKER` — circuit breaker for AI calls

These are scaffolded and tested but inactive in production.

**Rationale:** Progressive rollout strategy. Each module was implemented with full test coverage and can be enabled independently. Shipping them behind flags avoids destabilizing production while allowing incremental activation.

**Conditions to revisit:** Each flag should be evaluated for activation as the platform matures. Target: enable encryption and retention before first enterprise customer.

---

### AR-9: CORS Allows Null Origin (Same-Origin Requests)

| Field       | Value            |
| ----------- | ---------------- |
| Finding     | #28 (P2-MEDIUM)  |
| Location    | `lib/cors.ts:44` |
| Review date | 2026-08-19       |

**Risk:** `isOriginAllowed(null)` returns `true`. Same-origin requests don't include an `Origin` header, so this allows them through.

**Rationale:** This is correct behavior per the Fetch specification. Same-origin requests from the app's own pages should not be blocked. Blocking null origin would break the app's own API calls.

**Conditions to revisit:** None unless the threat model changes to include local file attacks (file:// origins also send null).

---

### AR-10: Error Responses May Include Internal Details

| Field       | Value                                           |
| ----------- | ----------------------------------------------- |
| Finding     | #35, #59 (P2-P3)                                |
| Location    | `lib/api-helpers.ts`, various `AppError` usages |
| Review date | 2026-05-19                                      |

**Risk:** `handleApiError` and `AppError` messages may include internal details that aid attackers in reconnaissance.

**Mitigations in place:**

- Production error responses use generic messages for 500 errors
- Stack traces are stripped in production (FIX: Audit #039)
- PII redaction in logger prevents sensitive data in logs
- `AppError` subclasses (`ValidationError`, `NotFoundError`) return user-facing messages

**Conditions to revisit:** If error messages start including SQL fragments, file paths, or internal service names.

---

### AR-11: CI Placeholder Secrets for Build

| Field       | Value                         |
| ----------- | ----------------------------- |
| Finding     | #36 (P2-MEDIUM)               |
| Location    | `.github/workflows/ci.yml:75` |
| Review date | N/A (by design)               |

**Risk:** CI uses `SUPABASE_JWT_SECRET: placeholder-jwt-secret-for-build` to satisfy Next.js build-time checks.

**Rationale:** Next.js validates environment variables during `next build`. The placeholder is only used in CI and never reaches production. The value is clearly marked as a placeholder and cannot be used to sign valid tokens.

**Conditions to revisit:** None. Production secrets come from deployment environment (Vercel/platform secrets).

---

### AR-12: Token Role vs Live Database Role

| Field       | Value                      |
| ----------- | -------------------------- |
| Finding     | #44 (P2-MEDIUM)            |
| Location    | `lib/authorization.ts:108` |
| Review date | 2026-05-19                 |

**Risk:** Authorization checks use the role from the session token, not a live DB lookup. If an admin revokes a user's role, the change doesn't take effect until the session expires (up to 7 days).

**Mitigations in place:**

- Sliding window renewal re-issues tokens with fresh data every 3.5 days
- Critical operations (credit deduction) use server-side RPCs that don't depend on token role
- Admin can force-expire sessions by rotating `SESSION_SECRET` (nuclear option)

**Conditions to revisit:** If immediate role revocation is required (e.g., compliance mandate, suspected compromise). Solution: add a token blocklist in Redis.

---

### AR-13: Credit Expiry Not Enforced at Deduction Time

| Field       | Value                                  |
| ----------- | -------------------------------------- |
| Findings    | #45, #49 (P2-P3)                       |
| Location    | `services/credits.db.service.ts:54-58` |
| Review date | 2026-05-19                             |

**Risk:** `getUserCredits()` has a defensive check for `credits_expiry_date`, but the column doesn't exist in any migration yet. Credit expiry is a future feature — currently credits don't expire.

**Rationale:** The code is forward-compatible. Adding expiry requires: (1) a migration to add the column, (2) updating the `deduct_credits_v2` RPC to check expiry atomically. This is tracked as a future enhancement.

**Conditions to revisit:** Before launching a subscription plan that includes expiring credits.

---

### AR-14: Format Validator Rule Coverage Unknown

| Field       | Value                   |
| ----------- | ----------------------- |
| Finding     | #53 (P3-LOW)            |
| Location    | `validation/` directory |
| Review date | 2026-08-19              |

**Risk:** Format-specific validators exist but the completeness of Schematron rule coverage has not been independently verified against the full EN 16931 rule set.

**Mitigations in place:**

- CI runs Schematron validation against official rules for XRechnung, PEPPOL BIS, and other formats
- Golden file tests verify specific known-good outputs
- Post-generation XML safety check (FIX: Re-audit #27) catches structural issues

**Conditions to revisit:** Before onboarding customers in new EU member states or adding new format standards.

---

### AR-15: No Integration or E2E Tests for Critical Flows

| Field       | Value              |
| ----------- | ------------------ |
| Findings    | #63, #64 (P3-LOW)  |
| Location    | `tests/` directory |
| Review date | 2026-05-19         |

**Risk:** No integration tests for the atomic credit-deduction → extraction flow. No E2E tests for the full extract → review → convert lifecycle.

**Mitigations in place:**

- 1492+ unit tests with 80% coverage thresholds
- Credit concurrency safety tests exist (`tests/credits-concurrency.test.ts`)
- Schematron validation in CI catches format-level regressions
- Manual QA before each release

**Conditions to revisit:** Before any major refactor of the extraction or conversion pipeline. Target: add integration test suite in Q2 2026.

---

### AR-16: Batch Worker Trigger Has No Retry on Network Failure

| Field       | Value                                     |
| ----------- | ----------------------------------------- |
| Finding     | #68 (P3-LOW)                              |
| Location    | `app/api/invoices/extract/route.ts:25-30` |
| Review date | 2026-08-19                                |

**Risk:** The batch worker trigger uses `fetch` with `AbortController` but doesn't retry on network failure. If the internal worker request fails, the batch job may not start.

**Mitigations in place:**

- The extract route returns a job ID immediately; the batch processor has its own retry logic
- BullMQ job queue provides at-least-once delivery semantics
- Network failures between services are rare in same-region deployments

**Conditions to revisit:** If deploying to multi-region or if batch job start failures are observed in monitoring.

---

### AR-17: userId Included in Structured Log Context

| Field       | Value               |
| ----------- | ------------------- |
| Finding     | #74 (P3-LOW)        |
| Location    | `lib/logger.ts:149` |
| Review date | 2026-08-19          |

**Risk:** `userId` is included in every log entry via the request context. This enables correlation but increases the PII surface in log storage.

**Rationale:** `userId` is essential for debugging multi-tenant issues, tracing authorization failures, and audit trail integrity. Without it, production debugging becomes impractical.

**Mitigations in place:**

- `userId` is a UUID (not email or name) — low PII sensitivity
- Log storage has access controls (Sentry project-level permissions)
- PII redaction in logger covers 30+ sensitive field names (emails, IBANs, tax IDs, tokens)

**Conditions to revisit:** If GDPR data protection authority classifies UUIDs as personal data requiring pseudonymization in logs.

---

### AR-18: No Runtime XSD Validation for Generated Invoices

| Field       | Value                         |
| ----------- | ----------------------------- |
| Finding     | F-024 (Audit V2)              |
| Location    | `services/format/` generators |
| Review date | 2026-06-01                    |

**Risk:** Generated XML invoices are not validated against XSD schemas at runtime before delivery. Malformed XML could pass structural checks but fail schema validation.

**Mitigations in place:**

- Structural element checks in each format generator ensure required elements are present
- KoSIT Schematron validation is available for XRechnung when enabled
- CI test suite validates golden file outputs against expected structure
- Post-generation XML safety check (`validateXmlSafety`) catches injection and structural issues

**Conditions to revisit:** When adding new formats, or if customer complaints about validation failures exceed 1%. Target: add CI-level XSD validation for all formats.

---

### AR-19: Database Connection Pooling

| Field       | Value                    |
| ----------- | ------------------------ |
| Finding     | F-028 (Audit V2)         |
| Location    | `lib/supabase.server.ts` |
| Review date | 2026-08-01               |

**Risk:** Application-level connection pooling is not explicitly configured. Each serverless function invocation creates a new Supabase client.

**Rationale:** Supabase cloud uses Supavisor (connection pooler) by default. The `NEXT_PUBLIC_SUPABASE_URL` automatically routes through the pooler. No additional pooling needed at application level for Vercel serverless deployments.

**Conditions to revisit:** If moving to self-hosted Supabase, or if connection exhaustion errors appear in logs.

---

## Operational Actions

### OPS-1: Enable CodeQL as Required Status Check

| Field    | Value                          |
| -------- | ------------------------------ |
| Findings | #69, #70 (P3-LOW)              |
| Location | `.github/workflows/codeql.yml` |
| Status   | Pending manual action          |

**Action:** In GitHub repository settings → Branches → Branch protection rules for `main`:

1. Add `CodeQL` to required status checks
2. This ensures CodeQL analysis runs and passes on every PR

**Context:** CodeQL exists as a separate workflow (`.github/workflows/codeql.yml`) and runs on PRs, but it is not currently a _required_ check — PRs can merge even if CodeQL finds issues.

---

## Findings Cross-Reference

For traceability, here is the mapping of all 83 audit findings to their resolution:

| Finding | Severity    | Resolution | Commit / Note                                          |
| ------- | ----------- | ---------- | ------------------------------------------------------ |
| #1      | P0-CRITICAL | Fixed      | `3c1e49f` — Authenticate jobs endpoint                 |
| #2      | P1-HIGH     | Fixed      | `2c8619a` — Validate aud claim                         |
| #3      | P1-HIGH     | Accepted   | **AR-1** — CSRF mitigated by sameSite + CORS           |
| #4      | P1-HIGH     | Fixed      | `6c21d4f` — Delete duplicate CreditService             |
| #5      | P1-HIGH     | Fixed      | `88331ae` — AI prompt injection sanitization           |
| #6      | P1-HIGH     | Fixed      | `88331ae` — AI prompt injection sanitization           |
| #7      | P1-HIGH     | Fixed      | `11fdb65` — Real credit check guard                    |
| #8      | P1-HIGH     | Fixed      | `3834483` — SIGTERM handler for workers                |
| #9      | P1-HIGH     | Fixed      | `3eb3db6` — Wire dead letter handler                   |
| #10     | P1-HIGH     | Fixed      | `f3efd15` — Document worker activation                 |
| #11     | P1-HIGH     | Fixed      | `70c436b` — Apply idempotency middleware               |
| #12     | P1-HIGH     | Fixed      | PII redaction in logger covers auth log fields         |
| #13     | P1-HIGH     | Fixed      | `c11925a` — Use request cookie in getAuthenticatedUser |
| #14     | P2-MEDIUM   | Accepted   | **AR-2** — No DI container                             |
| #15     | P2-MEDIUM   | Fixed      | Verified consolidated (canonical at `types/index.ts`)  |
| #16     | P2-MEDIUM   | Fixed      | `814851d` — Delete deprecated export                   |
| #17     | P2-MEDIUM   | Accepted   | **AR-3** — Random dev secret by design                 |
| #18     | P2-MEDIUM   | Accepted   | **AR-4** — 7-day TTL with sliding window               |
| #19     | P2-MEDIUM   | Accepted   | **AR-5** — sameSite lax                                |
| #20     | P2-MEDIUM   | Accepted   | **AR-6** — In-process cache                            |
| #21     | P2-MEDIUM   | Accepted   | **AR-7** — Admin client bypasses RLS                   |
| #22     | P2-MEDIUM   | Fixed      | `6c21d4f` — Removed duplicate CreditService            |
| #23     | P2-MEDIUM   | Accepted   | **AR-8** — Feature flags                               |
| #24     | P2-MEDIUM   | Fixed      | `11fdb65` — Real credit check replaces placeholder     |
| #25     | P2-MEDIUM   | Fixed      | `306e90b` — Document text truncation limit             |
| #26     | P2-MEDIUM   | Fixed      | `306e90b` — Redact response previews                   |
| #27     | P2-MEDIUM   | Fixed      | `02d4cd7` — Post-generation XML safety check           |
| #28     | P2-MEDIUM   | Accepted   | **AR-9** — Null origin by design                       |
| #29     | P2-MEDIUM   | Fixed      | `1e04674` — Idempotency-Key in CORS headers            |
| #30     | P2-MEDIUM   | Fixed      | `6ed3e8c` — Dynamic CORS origin check                  |
| #31     | P2-MEDIUM   | Fixed      | `b8cd707` — Strengthen password policy                 |
| #32     | P2-MEDIUM   | Fixed      | `b8cd707` — Password complexity requirements           |
| #33     | P2-MEDIUM   | Fixed      | `3822cf8` — Document network restrictions              |
| #34     | P2-MEDIUM   | Fixed      | `3822cf8` — Document captcha settings                  |
| #35     | P2-MEDIUM   | Accepted   | **AR-10** — Error detail leakage                       |
| #36     | P2-MEDIUM   | Accepted   | **AR-11** — CI placeholder secrets                     |
| #37     | P2-MEDIUM   | Fixed      | `92425c4` — Raise audit to high severity               |
| #38     | P2-MEDIUM   | Fixed      | `92425c4` — Coverage thresholds at 80%                 |
| #39     | P2-MEDIUM   | Fixed      | `29d369b` — Strip stack traces in production           |
| #40     | P2-MEDIUM   | Fixed      | `2a1914b` — Atomic batch credit expansion              |
| #41     | P2-MEDIUM   | Fixed      | `fd42a63` — Idempotent credit refund                   |
| #42     | P2-MEDIUM   | Fixed      | `8e1366d` — Structured retryable error detection       |
| #43     | P2-MEDIUM   | Accepted   | **AR-8** — Feature flags                               |
| #44     | P2-MEDIUM   | Accepted   | **AR-12** — Token role vs DB role                      |
| #45     | P2-MEDIUM   | Accepted   | **AR-13** — Credit expiry future feature               |
| #46     | P3-LOW      | Fixed      | Documented in batch.processor.ts                       |
| #47     | P3-LOW      | Fixed      | Non-critical by design (session still valid)           |
| #48     | P3-LOW      | Fixed      | `16072d8` — Dated TODO for removal                     |
| #49     | P3-LOW      | Accepted   | **AR-13** — Credit expiry future feature               |
| #50     | P3-LOW      | Fixed      | `f3efd15` — Documented lazy connections                |
| #51     | P3-LOW      | Fixed      | `16072d8` — Configurable thinking budget               |
| #52     | P3-LOW      | Fixed      | `3910ca9` — Replace @ts-ignore with @ts-expect-error   |
| #53     | P3-LOW      | Accepted   | **AR-14** — Validator completeness                     |
| #54     | P3-LOW      | Fixed      | `f90a2f5` — X-XSS-Protection set to 0                  |
| #55     | P3-LOW      | Fixed      | `f90a2f5` — Add CSP header                             |
| #56     | P3-LOW      | Fixed      | Rate limiter key is per-user by design                 |
| #57     | P3-LOW      | Fixed      | `3822cf8` — Disable S3 protocol                        |
| #58     | P3-LOW      | Fixed      | `3822cf8` — Disable Realtime                           |
| #59     | P3-LOW      | Accepted   | **AR-10** — Error detail leakage                       |
| #60     | P3-LOW      | Fixed      | `16072d8` — shouldLog check on warn                    |
| #61     | P3-LOW      | Fixed      | PII redaction covers sensitive fields                  |
| #62     | P3-LOW      | Fixed      | `92425c4` — Upgrade to Node 20                         |
| #63     | P3-LOW      | Accepted   | **AR-15** — No integration tests                       |
| #64     | P3-LOW      | Accepted   | **AR-15** — No E2E tests                               |
| #65     | P3-LOW      | Accepted   | **AR-8** — Feature flags                               |
| #66     | P3-LOW      | Fixed      | `bcfb1c8` — Documented retry policies                  |
| #67     | P3-LOW      | Fixed      | `bcfb1c8` — Documented circuit breaker defaults        |
| #68     | P3-LOW      | Accepted   | **AR-16** — Batch trigger no retry                     |
| #69     | P3-LOW      | Action     | **OPS-1** — CodeQL required check                      |
| #70     | P3-LOW      | Action     | **OPS-1** — CodeQL required check                      |
| #71     | P3-LOW      | N/A        | No Docker deployment currently                         |
| #72     | P3-LOW      | Fixed      | Verified clean (no stale DeepSeek refs)                |
| #73     | P3-LOW      | Fixed      | `6ed3e8c` — Remove redundant OPTIONS handler           |
| #74     | P3-LOW      | Accepted   | **AR-17** — userId in logs by design                   |
| #75     | P4-INFO     | N/A        | `coverage/` in `.gitignore`                            |
| #76     | P4-INFO     | N/A        | Token versioning prepared for future rotation          |
| #77     | P4-INFO     | N/A        | State machine opt-in by design                         |
| #78     | P4-INFO     | N/A        | Model pinning via env var                              |
| #79     | P4-INFO     | N/A        | 9 format generators — comprehensive                    |
| #80     | P4-INFO     | N/A        | Error hierarchy well-structured                        |
| #81     | P4-INFO     | N/A        | PII redaction comprehensive                            |
| #82     | P4-INFO     | N/A        | XML security module comprehensive                      |
| #83     | P4-INFO     | N/A        | Schematron validation in CI                            |
