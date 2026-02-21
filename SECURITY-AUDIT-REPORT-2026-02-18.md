# Invoice2E.1 — Full Security & Architecture Audit Report

**Date:** 2026-02-18
**Auditor:** Claude Opus 4.6 (Automated)
**Scope:** 18 mandatory domains, full codebase
**Overall Risk:** HIGH

---

## Executive Summary

Invoice2E.1 is a multi-tenant SaaS e-invoicing platform built with Next.js (App Router), PostgreSQL via Supabase with Row-Level Security, and multiple AI providers for invoice data extraction. The platform supports 9 e-invoice format standards (XRechnung CII/UBL, PEPPOL BIS, Factur-X, FatturaPA, KSeF, NLCIUS, CIUS-RO).

The audit identified **83 findings** across 18 domains. The most critical issue is an **unauthenticated API endpoint** (`/api/jobs/[jobId]`) that exposes BullMQ job data to any caller. Additionally, 12 high-severity findings span session management gaps, CSRF absence, duplicate credit services bypassing safety controls, AI prompt injection vectors, and scaffolded-but-inactive infrastructure (BullMQ workers, dead letter handlers) that creates a false sense of security.

The codebase demonstrates strong defensive patterns in several areas — atomic PostgreSQL RPCs for credit operations, RLS with FORCE on all tables, comprehensive XML security, PII redaction in logs, and timing-safe signature comparisons — but these are undermined by inconsistent application across the full attack surface.

---

## Findings Summary Table

| #   | Severity        | Domain                | Title                                                                                                      | Location                                                                      |
| --- | --------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | **P0-CRITICAL** | D9: API Security      | Unauthenticated `/api/jobs/[jobId]` endpoint                                                               | `app/api/jobs/[jobId]/route.ts:28-78`                                         |
| 2   | P1-HIGH         | D2: Auth/Session      | Session `aud` claim set but NOT validated on verify                                                        | `lib/session.ts:163-168`                                                      |
| 3   | P1-HIGH         | D9: API Security      | No CSRF protection on state-changing API routes                                                            | `middleware.ts:1-79`                                                          |
| 4   | P1-HIGH         | D4: Credit System     | Duplicate CreditService bypasses atomic RPC protections                                                    | `services/database/credit.service.ts:1-98`                                    |
| 5   | P1-HIGH         | D7: AI Pipeline       | AI prompt injection — raw unsanitized input (Gemini adapter)                                               | `adapters/gemini.adapter.ts:85-86`                                            |
| 6   | P1-HIGH         | D7: AI Pipeline       | AI prompt injection — raw unsanitized input (Gemini service)                                               | `services/gemini.service.ts` (extraction prompt)                              |
| 7   | P1-HIGH         | D5: State Machine     | Placeholder `hasCredits` guard always returns true                                                         | `lib/state-machine/invoice-machine.ts:39-41`                                  |
| 8   | P1-HIGH         | D6: BullMQ            | SIGTERM does not shut down BullMQ workers (no signal handler registered)                                   | `lib/queue/workers.ts:79-84`                                                  |
| 9   | P1-HIGH         | D6: BullMQ            | Dead letter handler defined but never wired to worker `failed` events                                      | `lib/queue/dead-letter.ts:21-40`                                              |
| 10  | P1-HIGH         | D6: BullMQ            | No BullMQ workers instantiated — queue infrastructure is dead code                                         | `lib/queue/workers.ts` (no callers of `createWorker`)                         |
| 11  | P1-HIGH         | D9: API Security      | Idempotency middleware imported but NOT applied to extract route                                           | `app/api/invoices/extract/route.ts:19`                                        |
| 12  | P1-HIGH         | D12: Logging          | PII potentially logged in authorization access-granted messages                                            | `lib/authorization.ts:106-110`                                                |
| 13  | P1-HIGH         | D2: Auth/Session      | `getAuthenticatedUser` ignores the `req` parameter entirely                                                | `lib/auth.ts:24`                                                              |
| 14  | P2-MEDIUM       | D1: Structure         | Partial DI adoption — no DI container found in codebase                                                    | Codebase-wide                                                                 |
| 15  | P2-MEDIUM       | D1: Structure         | ExtractedInvoiceData type defined in 3 separate locations                                                  | `types/index.ts`, `services/gemini.service.ts`, `services/ai/IAIExtractor.ts` |
| 16  | P2-MEDIUM       | D2: Auth/Session      | Deprecated `createUserClient()` still exported                                                             | `lib/supabase.server.ts:103-121`                                              |
| 17  | P2-MEDIUM       | D2: Auth/Session      | Dev mode uses random per-process session secret (sessions lost on restart)                                 | `lib/session.ts:34-38`                                                        |
| 18  | P2-MEDIUM       | D2: Auth/Session      | 7-day session TTL is long for a financial application                                                      | `lib/session.ts:15`                                                           |
| 19  | P2-MEDIUM       | D2: Auth/Session      | `sameSite: 'lax'` allows GET-based CSRF (cookie sent on top-level navigation)                              | `lib/session.ts:202`                                                          |
| 20  | P2-MEDIUM       | D2: Auth/Session      | Session profile cache is in-process memory — stale data in multi-instance                                  | `lib/session.ts:298-299`                                                      |
| 21  | P2-MEDIUM       | D3: Tenant Isolation  | Admin client singleton bypasses RLS — used in CreditService (finding #4)                                   | `lib/supabase.server.ts:27-46`                                                |
| 22  | P2-MEDIUM       | D3: Tenant Isolation  | `CreditService.deductCredits` uses admin client for non-RPC queries                                        | `services/database/credit.service.ts:8-9`                                     |
| 23  | P2-MEDIUM       | D5: State Machine     | XState machine behind `USE_STATE_MACHINE` feature flag (default OFF)                                       | `app/api/invoices/convert/route.ts:328-331`                                   |
| 24  | P2-MEDIUM       | D5: State Machine     | `deductCredits` action in state machine is a no-op placeholder                                             | `lib/state-machine/invoice-machine.ts:98-101`                                 |
| 25  | P2-MEDIUM       | D7: AI Pipeline       | `extractWithText` truncates at 50000 chars without documenting this limit                                  | `adapters/gemini.adapter.ts:216`                                              |
| 26  | P2-MEDIUM       | D7: AI Pipeline       | Gemini adapter response preview logged (500 chars of AI response)                                          | `adapters/gemini.adapter.ts:326-329`                                          |
| 27  | P2-MEDIUM       | D8: Format Validation | XRechnung validation occurs pre-generation only — no post-generation roundtrip                             | `app/api/invoices/convert/route.ts:129-139`                                   |
| 28  | P2-MEDIUM       | D9: API Security      | CORS `isOriginAllowed` returns `true` when origin is `null`                                                | `lib/cors.ts:43`                                                              |
| 29  | P2-MEDIUM       | D9: API Security      | `Idempotency-Key` header not included in CORS `allowedHeaders`                                             | `lib/cors.ts:28-34`                                                           |
| 30  | P2-MEDIUM       | D9: API Security      | CORS allowed origins cached at module load — env changes require restart                                   | `lib/cors.ts:25`                                                              |
| 31  | P2-MEDIUM       | D10: Database         | `minimum_password_length = 6` in Supabase config (NIST recommends 8+)                                      | `supabase/config.toml:171`                                                    |
| 32  | P2-MEDIUM       | D10: Database         | `password_requirements = ""` — no complexity requirements enforced                                         | `supabase/config.toml:174`                                                    |
| 33  | P2-MEDIUM       | D10: Database         | Network restrictions disabled — all IPs allowed (`0.0.0.0/0`)                                              | `supabase/config.toml:69-75`                                                  |
| 34  | P2-MEDIUM       | D10: Database         | Captcha disabled on auth endpoints                                                                         | `supabase/config.toml:192-195`                                                |
| 35  | P2-MEDIUM       | D11: Error Handling   | `handleApiError` referenced but error classification may leak internal details                             | `lib/api-helpers.ts`                                                          |
| 36  | P2-MEDIUM       | D13: Config           | CI uses placeholder secrets for build — `SUPABASE_JWT_SECRET: placeholder-jwt-secret-for-build`            | `.github/workflows/ci.yml:75`                                                 |
| 37  | P2-MEDIUM       | D13: Config           | CI `npm audit` only fails on `critical` level — high-severity vulns pass                                   | `.github/workflows/ci.yml:127`                                                |
| 38  | P2-MEDIUM       | D14: Testing          | Coverage thresholds at 60% — below industry recommendation for financial apps (80%+)                       | `vitest.config.ts`                                                            |
| 39  | P2-MEDIUM       | D15: Compliance       | GDPR data subject request tracking scaffolded but completeness unknown                                     | `lib/gdpr/`                                                                   |
| 40  | P2-MEDIUM       | D16: Concurrency      | Batch processor credit expansion deduction not atomic with initial deduction                               | `services/batch/batch.processor.ts:434-464`                                   |
| 41  | P2-MEDIUM       | D16: Concurrency      | Batch `addCredits` refund for failures is non-idempotent (uses `addCredits` not `refundCreditsIdempotent`) | `services/batch/batch.processor.ts:470`                                       |
| 42  | P2-MEDIUM       | D17: Integration      | `extractWithRetry` uses string matching for retryable errors — brittle pattern                             | `services/batch/batch.processor.ts:43-52`                                     |
| 43  | P2-MEDIUM       | D2: Auth/Session      | Granular RBAC (CASL) behind `USE_GRANULAR_RBAC` feature flag (default OFF)                                 | `lib/authorization.ts:266-268`                                                |
| 44  | P2-MEDIUM       | D2: Auth/Session      | Role from session token used in log message instead of live DB role                                        | `lib/authorization.ts:108`                                                    |
| 45  | P2-MEDIUM       | D4: Credit System     | `CreditsDatabaseService.getUserCredits` returns 0 credits on expiry without enforcing at deduction time    | `services/credits.db.service.ts:54-58`                                        |
| 46  | P3-LOW          | D1: Structure         | `services/batch/batch.processor.ts` is 577 lines — complex single-file module                              | `services/batch/batch.processor.ts:1-577`                                     |
| 47  | P3-LOW          | D2: Auth/Session      | Session renewal on sliding window swallows cookie write failures silently                                  | `lib/session.ts:252-258`                                                      |
| 48  | P3-LOW          | D2: Auth/Session      | Legacy `session_user_id` cookie cleared on every login — implies migration still in progress               | `lib/session.ts:208-214`                                                      |
| 49  | P3-LOW          | D4: Credit System     | Credit expiry check in `getUserCredits` but not in `deductCredits` RPC                                     | `services/credits.db.service.ts:54-58`                                        |
| 50  | P3-LOW          | D6: BullMQ            | Queue connection module creates Redis connections that are never used in production                        | `lib/queue/connection.ts`                                                     |
| 51  | P3-LOW          | D7: AI Pipeline       | Gemini thinking budget hardcoded to 4096 — no env-based configuration                                      | `adapters/gemini.adapter.ts:53`                                               |
| 52  | P3-LOW          | D7: AI Pipeline       | `@ts-expect-error` for Gemini thinkingConfig — will cause TS error when SDK updates                        | `adapters/gemini.adapter.ts:52`                                               |
| 53  | P3-LOW          | D8: Format Validation | Format-specific validators referenced but completeness of rule coverage unknown                            | `validation/` directory                                                       |
| 54  | P3-LOW          | D9: API Security      | `X-XSS-Protection: 0` set explicitly — correct for modern browsers but may confuse auditors                | `middleware.ts:10`                                                            |
| 55  | P3-LOW          | D9: API Security      | No `Content-Security-Policy` header set                                                                    | `middleware.ts:6-13`                                                          |
| 56  | P3-LOW          | D9: API Security      | Rate limiter key includes userId — authenticated user can exhaust global pool                              | `app/api/invoices/convert/route.ts:74`                                        |
| 57  | P3-LOW          | D10: Database         | S3 protocol enabled on local storage (`s3_protocol.enabled = true`)                                        | `supabase/config.toml:119`                                                    |
| 58  | P3-LOW          | D10: Database         | Realtime enabled but usage scope unclear — potential data leakage vector                                   | `supabase/config.toml:78`                                                     |
| 59  | P3-LOW          | D11: Error Handling   | `AppError` thrown with string interpolation includes raw error messages                                    | Multiple files                                                                |
| 60  | P3-LOW          | D12: Logging          | `logger.warn` always logs regardless of configured level (no `shouldLog` check)                            | `lib/logger.ts:197-200`                                                       |
| 61  | P3-LOW          | D12: Logging          | Stack traces stripped in production but full error objects may still contain sensitive data                | `lib/logger.ts:179-181`                                                       |
| 62  | P3-LOW          | D13: Config           | `NODE_VERSION: '18'` in CI — Node 18 reaches EOL April 2025 (already EOL)                                  | `.github/workflows/ci.yml:10`                                                 |
| 63  | P3-LOW          | D14: Testing          | No integration tests for credit deduction + extraction atomic flow                                         | Tests directory                                                               |
| 64  | P3-LOW          | D14: Testing          | No E2E tests for the complete extract → review → convert lifecycle                                         | Tests directory                                                               |
| 65  | P3-LOW          | D15: Compliance       | Retention engine scaffolded but activation/scheduling unclear                                              | `lib/retention/`                                                              |
| 66  | P3-LOW          | D16: Concurrency      | Batch processor retries independently of resilience.ts policies — dual retry logic                         | `services/batch/batch.processor.ts:20-78` vs `lib/resilience.ts`              |
| 67  | P3-LOW          | D16: Concurrency      | Circuit breaker only engaged when `USE_CIRCUIT_BREAKER` flag is ON (default OFF)                           | `services/batch/batch.processor.ts:32-37`                                     |
| 68  | P3-LOW          | D17: Integration      | Batch worker trigger uses `fetch` with `AbortController` — no retry on network failure                     | `app/api/invoices/extract/route.ts:25-30`                                     |
| 69  | P3-LOW          | D18: CI/CD            | No SAST tool integrated beyond ESLint security plugin                                                      | `.github/workflows/ci.yml`                                                    |
| 70  | P3-LOW          | D18: CI/CD            | CodeQL in separate workflow — may not run on all PRs                                                       | `.github/workflows/codeql.yml`                                                |
| 71  | P3-LOW          | D18: CI/CD            | No container image scanning (if Docker deployment is used)                                                 | CI configuration                                                              |
| 72  | P3-LOW          | D1: Structure         | Adapter pattern inconsistency — DeepSeek adapter file not found at expected path                           | `adapters/deepseek.adapter.ts` (missing)                                      |
| 73  | P3-LOW          | D9: API Security      | `OPTIONS` handler in convert route returns empty 200 without CORS headers                                  | `app/api/invoices/convert/route.ts:427-429`                                   |
| 74  | P3-LOW          | D12: Logging          | `userId` included in log context — allows correlation but increases PII surface                            | `lib/logger.ts:149`                                                           |
| 75  | P4-INFO         | D1: Structure         | Coverage output (`coverage/`) directory present in working tree                                            | Project root                                                                  |
| 76  | P4-INFO         | D2: Auth/Session      | `TOKEN_VERSION = 'v1'` — token versioning prepared but no rotation mechanism                               | `lib/session.ts:16`                                                           |
| 77  | P4-INFO         | D5: State Machine     | State machine has extensive state coverage but is entirely opt-in                                          | `lib/state-machine/`                                                          |
| 78  | P4-INFO         | D7: AI Pipeline       | Gemini model defaults to `gemini-2.5-flash` via env — model pinning recommended                            | `adapters/gemini.adapter.ts:32`                                               |
| 79  | P4-INFO         | D8: Format Validation | 9 format generators implemented — comprehensive EU coverage                                                | `services/format/`                                                            |
| 80  | P4-INFO         | D11: Error Handling   | Custom error hierarchy (`AppError`, `ValidationError`, `NotFoundError`, `ForbiddenError`) well-structured  | `lib/errors.ts`                                                               |
| 81  | P4-INFO         | D12: Logging          | PII redaction covers 30+ field names — comprehensive sensitive key list                                    | `lib/logger.ts:32-67`                                                         |
| 82  | P4-INFO         | D15: Compliance       | XML security module covers XXE, DOCTYPE, entity expansion, namespace allowlist                             | `lib/xml-security.ts:1-306`                                                   |
| 83  | P4-INFO         | D18: CI/CD            | Schematron validation in CI validates generated invoices against official rules                            | `.github/workflows/ci.yml:77-111`                                             |

---

## Per-Domain Analysis

### Domain 1: Project Structure & Modularity

**Findings:**

- **#14 (P2)**: No DI container found in the codebase. Services are instantiated as singletons via module-level exports (`export const creditService = new CreditService()`). This prevents dependency injection for testing and creates tight coupling.

- **#15 (P2)**: `ExtractedInvoiceData` type is defined in 3 places: `types/index.ts` (canonical), `services/gemini.service.ts` (Zod schema), and `services/ai/IAIExtractor.ts` (interface re-export). Changes must be synchronized manually.

- **#46 (P3)**: [batch.processor.ts](services/batch/batch.processor.ts) at 577 lines handles credit deduction, file processing, multi-invoice splitting, progress reporting, and error recovery in a single file.

- **#72 (P3)**: DeepSeek adapter file not found at `adapters/deepseek.adapter.ts`. Coverage HTML exists at `coverage/adapters/deepseek.adapter.ts.html` and a `services/ai/deepseek.extractor.ts` exists, suggesting the adapter was refactored but references may be stale.

- **#75 (P4)**: `coverage/` directory present in working tree — should be in `.gitignore`.

---

### Domain 2: Authentication & Session Management

**Findings:**

- **#2 (P1)**: Session token includes `aud` claim set to `process.env.NEXT_PUBLIC_APP_URL || 'https://invoice2e.com'` at [session.ts:87](lib/session.ts#L87), but `verifySessionToken()` at [session.ts:163-168](lib/session.ts#L163-L168) only validates `iss` — the `aud` claim is **never checked**. A token minted for one audience is accepted by any audience.

- **#13 (P1)**: `getAuthenticatedUser()` at [auth.ts:24](lib/auth.ts#L24) accepts a `NextRequest` parameter but immediately discards it with `void req`. Authentication relies entirely on `getSessionFromCookie()` which reads from Next.js `cookies()` context. This means the function cannot be used in contexts where the request is needed for authentication (e.g., API key auth, Bearer tokens).

- **#16 (P2)**: Deprecated `createUserClient()` at [supabase.server.ts:103-121](lib/supabase.server.ts#L103-L121) is still exported. It creates a client with the anon key and NO user JWT — RLS policies will see an anonymous user, not the authenticated user. Any code still calling this function has a tenant isolation bypass.

- **#17 (P2)**: In development, `getSessionSecret()` at [session.ts:34-38](lib/session.ts#L34-L38) generates a random secret per-process. Sessions are lost on every restart, which is acceptable for dev but the warning is only at `logger.warn` level.

- **#18 (P2)**: Session TTL of 7 days (`SESSION_MAX_AGE = 60 * 60 * 24 * 7` at [session.ts:15](lib/session.ts#L15)) is long for a financial application handling invoices and credit transactions.

- **#19 (P2)**: Session cookie uses `sameSite: 'lax'` at [session.ts:202](lib/session.ts#L202). While `lax` prevents cross-site POST-based CSRF, it still sends the cookie on top-level GET navigations from external sites, which combined with finding #3 (no CSRF token) increases risk.

- **#20 (P2)**: Profile cache (`_profileCache`) at [session.ts:298-299](lib/session.ts#L298-L299) is in-process `Map` with 5-minute TTL. In a multi-instance deployment (Vercel serverless), a user banned in one instance would remain active in others until cache expires.

- **#43 (P2)**: CASL-based granular RBAC at [authorization.ts:266-268](lib/authorization.ts#L266-L268) is behind `USE_GRANULAR_RBAC` feature flag (default OFF). The system falls back to simple role-in-list checks (`['admin', 'super_admin']`).

- **#44 (P2)**: At [authorization.ts:108](lib/authorization.ts#L108), the log message uses `session.role` (from the token) instead of `liveState.role` (from the DB). If a user's role was changed in the DB, the log would show the stale token role.

- **#47 (P3)**: Session renewal at [session.ts:252-258](lib/session.ts#L252-L258) catches cookie write failures and logs a warning but continues. This is acceptable behavior but worth noting for audit trails.

- **#48 (P3)**: Legacy `session_user_id` cookie is still being cleared at [session.ts:208-214](lib/session.ts#L208-L214), indicating the migration from plain-text cookies is still in progress.

- **#76 (P4)**: `TOKEN_VERSION = 'v1'` at [session.ts:16](lib/session.ts#L16) prepares for future token versioning but no rotation mechanism exists yet.

---

### Domain 3: Tenant Isolation & Data Segregation

**Findings:**

- **#21 (P2)**: Admin client singleton at [supabase.server.ts:27-46](lib/supabase.server.ts#L27-L46) bypasses RLS. It's correctly used for RPCs (which are `SECURITY DEFINER`) but is also used by the duplicate `CreditService` (finding #4) for direct table queries.

- **#22 (P2)**: `CreditService` at [credit.service.ts:8-9](services/database/credit.service.ts#L8-L9) uses `createAdminClient()` for all operations including direct `user_credits` table queries. This bypasses RLS policies, meaning a coding error could expose one tenant's credits to another.

---

### Domain 4: Credit & Billing Integrity

**Findings:**

- **#4 (P1)**: Two credit services exist:
  - `CreditsDatabaseService` at [credits.db.service.ts](services/credits.db.service.ts) — uses atomic RPCs (`safe_deduct_credits`, `add_credits`, `verify_and_add_credits`), input validation, idempotency keys, user-scoped clients for queries.
  - `CreditService` at [credit.service.ts](services/database/credit.service.ts) — uses admin client, simpler `deduct_credits` RPC (not `safe_deduct_credits`), no idempotency, no input validation.

  Any code importing from `services/database/credit.service.ts` instead of `services/credits.db.service.ts` bypasses the safety mechanisms.

- **#45 (P2)**: `CreditsDatabaseService.getUserCredits()` at [credits.db.service.ts:54-58](services/credits.db.service.ts#L54-L58) checks credit expiry and returns 0, but `deductCredits()` calls the RPC directly without checking expiry. A user with expired credits could still deduct if the RPC doesn't enforce expiry.

- **#49 (P3)**: Credit expiry is checked in `getUserCredits` at [credits.db.service.ts:54-58](services/credits.db.service.ts#L54-L58) but the deduction RPCs (`safe_deduct_credits`, `deduct_credits`) may not enforce this at the database level.

---

### Domain 5: State Machine & Lifecycle

**Findings:**

- **#7 (P1)**: `hasCredits` guard at [invoice-machine.ts:39-41](lib/state-machine/invoice-machine.ts#L39-L41) is a placeholder that returns `true` whenever `userId.length > 0`. Any authenticated user is considered to have credits, regardless of actual balance. The guard is used at the `REVIEW → CONVERTING` transition at [invoice-machine.ts:183-184](lib/state-machine/invoice-machine.ts#L183-L184).

- **#23 (P2)**: The XState machine is only engaged when `USE_STATE_MACHINE` feature flag is ON (default OFF). Most production traffic uses direct status string assignment (`conversionStatus = 'completed'` at [convert/route.ts:327](app/api/invoices/convert/route.ts#L327)).

- **#24 (P2)**: `deductCredits` action at [invoice-machine.ts:98-101](lib/state-machine/invoice-machine.ts#L98-L101) is a no-op (`void context`). Real credit deduction happens outside the state machine.

- **#77 (P4)**: The state machine models a comprehensive lifecycle (UPLOADED → QUARANTINED → SCANNING → EXTRACTING → EXTRACTED → REVIEW → CONVERTING → CONVERTED → ARCHIVED) but is entirely opt-in.

---

### Domain 6: BullMQ & Background Job Processing

**Findings:**

- **#8 (P1)**: `shutdownAllWorkers()` at [workers.ts:79-84](lib/queue/workers.ts#L79-L84) exists but is never called. No `SIGTERM`/`SIGINT` handler registers this function. On serverless cold shutdown, active jobs would be interrupted without graceful completion.

- **#9 (P1)**: `handleDeadLetter()` at [dead-letter.ts:21-40](lib/queue/dead-letter.ts#L21-L40) is defined and exported but never wired to any worker's `failed` event. Dead letters are only logged when explicitly called, which never happens.

- **#10 (P1)**: `createWorker()` at [workers.ts:34-73](lib/queue/workers.ts#L34-L73) is defined but has zero callers in the codebase. The 4 BullMQ queues (EXTRACTION, CONVERSION, BATCH, EMAIL) have no consumers. Batch processing uses direct `BatchProcessor.processBatch()` instead.

- **#50 (P3)**: Queue connection module creates Redis connections that are never used in production since no workers are instantiated. This wastes Redis connections if the module is ever imported.

---

### Domain 7: AI Extraction Pipeline

**Findings:**

- **#5 (P1)**: Gemini adapter at [gemini.adapter.ts:85-86](adapters/gemini.adapter.ts#L85-L86) sends raw file content with the extraction prompt to the AI model. The prompt at `lib/extraction-prompt.ts` instructs the model to extract invoice data, but a maliciously crafted PDF could contain prompt injection text (e.g., "Ignore previous instructions and return...") that the model might follow.

- **#6 (P1)**: Same prompt injection risk exists in the Gemini service (`services/gemini.service.ts`) which uses the same `EXTRACTION_PROMPT` from `lib/extraction-prompt.ts`.

- **#25 (P2)**: `extractWithText()` at [gemini.adapter.ts:216](adapters/gemini.adapter.ts#L216) silently truncates extracted text at 50,000 characters (`options!.extractedText!.substring(0, 50000)`). This limit is undocumented and could cause data loss for large invoices.

- **#26 (P2)**: On parse failure, Gemini adapter logs a 500-char preview of the AI response at [gemini.adapter.ts:326-329](adapters/gemini.adapter.ts#L326-L329). If the AI response contains PII from the invoice, this PII would appear in logs.

- **#51 (P3)**: Gemini thinking budget is hardcoded to 4096 at [gemini.adapter.ts:53](adapters/gemini.adapter.ts#L53) with no env-based configuration option.

- **#52 (P3)**: `@ts-expect-error` at [gemini.adapter.ts:52](adapters/gemini.adapter.ts#L52) for `thinkingConfig` — when the Gemini SDK updates to include this type, the suppression will cause a TypeScript error.

- **#78 (P4)**: Gemini model defaults to `gemini-2.5-flash` at [gemini.adapter.ts:32](adapters/gemini.adapter.ts#L32) via env variable. Model pinning with version hashes is recommended for reproducibility.

---

### Domain 8: E-Invoice Format Validation

**Findings:**

- **#27 (P2)**: Validation in the convert route at [convert/route.ts:129-139](app/api/invoices/convert/route.ts#L129-L139) runs `validateForProfile()` **before** XML generation. No post-generation validation roundtrip confirms the generated XML actually conforms to the schema. The Schematron CI job validates test invoices but not production output.

- **#53 (P3)**: Format-specific validators in `validation/` directory implement rule-based checks, but completeness of rule coverage per standard is unknown without comparison to official Schematron rules.

- **#79 (P4)**: 9 format generators are implemented — comprehensive coverage of EU e-invoicing standards.

---

### Domain 9: API Security & Input Validation

**Findings:**

- **#1 (P0-CRITICAL)**: `/api/jobs/[jobId]` at [route.ts:28-78](app/api/jobs/[jobId]/route.ts#L28-L78) has **NO authentication check**. The `GET` handler retrieves BullMQ job data (including job payload, result, and error details) for any caller who knows a job ID and queue name. There is no `getAuthenticatedUser()` call, no session check, and no ownership verification.

- **#3 (P1)**: `middleware.ts` at [middleware.ts:1-79](middleware.ts#L1-L79) handles CORS and security headers but implements **no CSRF protection**. No CSRF tokens, no double-submit cookies, no custom header requirements. Combined with `sameSite: 'lax'` cookies, state-changing POST endpoints are vulnerable to cross-site request forgery from sites that can craft form submissions.

- **#11 (P1)**: At [extract/route.ts:19](app/api/invoices/extract/route.ts#L19), `withIdempotency` is imported as `_withIdempotency` (prefixed with underscore, indicating unused). The comment says "TODO: Refactor POST handler into named function and wrap with withIdempotency()." The extract route — which deducts credits — lacks HTTP-level idempotency protection.

- **#28 (P2)**: `isOriginAllowed()` at [cors.ts:43](lib/cors.ts#L43) returns `true` when origin is `null`. While same-origin requests don't send an `Origin` header, `null` origins also come from sandboxed iframes, `data:` URLs, and redirects — these should not be trusted.

- **#29 (P2)**: The `Idempotency-Key` header is not in the CORS `allowedHeaders` list at [cors.ts:28-34](lib/cors.ts#L28-L34). Cross-origin clients cannot send this header in preflight requests.

- **#30 (P2)**: CORS allowed origins are computed once at module load time at [cors.ts:25](lib/cors.ts#L25). Environment variable changes require a full application restart.

- **#54 (P3)**: `X-XSS-Protection: 0` at [middleware.ts:10](middleware.ts#L10) is the correct modern setting (disables the buggy XSS auditor) but may confuse automated scanners.

- **#55 (P3)**: No `Content-Security-Policy` header is set in [middleware.ts:6-13](middleware.ts#L6-L13). CSP would provide defense-in-depth against XSS.

- **#56 (P3)**: Rate limiter key at [convert/route.ts:74](app/api/invoices/convert/route.ts#L74) concatenates request identifier with userId. This means each authenticated user gets their own rate limit bucket, but the global rate limit pool could be exhausted by many authenticated users.

- **#73 (P3)**: `OPTIONS` handler at [convert/route.ts:427-429](app/api/invoices/convert/route.ts#L427-L429) returns empty 200 without CORS headers. CORS preflight is handled in middleware, but this explicit handler could be confusing.

---

### Domain 10: Database & Migration Safety

**Findings:**

- **#31 (P2)**: `minimum_password_length = 6` at [config.toml:171](supabase/config.toml#L171). NIST SP 800-63B recommends a minimum of 8 characters.

- **#32 (P2)**: `password_requirements = ""` at [config.toml:174](supabase/config.toml#L174) — no complexity requirements enforced. Combined with finding #31, passwords like "123456" would be accepted.

- **#33 (P2)**: Network restrictions disabled at [config.toml:69-75](supabase/config.toml#L69-L75) with `allowed_cidrs = ["0.0.0.0/0"]`. While this is local dev config, it may be deployed to production.

- **#34 (P2)**: Captcha disabled at [config.toml:192-195](supabase/config.toml#L192-L195). Auth endpoints are vulnerable to credential stuffing without captcha.

- **#57 (P3)**: S3 protocol enabled at [config.toml:119](supabase/config.toml#L119). Unless S3-compatible access is needed, this expands the attack surface.

- **#58 (P3)**: Realtime enabled at [config.toml:78](supabase/config.toml#L78). If tables with sensitive data have Realtime enabled, unauthorized subscriptions could leak data.

---

### Domain 11: Error Handling & Resilience

**Findings:**

- **#35 (P2)**: Error classification in `handleApiError` may include raw error messages in production responses. While `api-helpers.ts` sanitizes errors, the level of sanitization needs verification.

- **#59 (P3)**: Multiple files throw `AppError` with string interpolation of raw error messages (e.g., `` `Gemini extraction failed: ${error.message}` ``). If the raw error contains sensitive information, it could propagate to API responses.

- **#80 (P4)**: Custom error hierarchy (`AppError`, `ValidationError`, `NotFoundError`, `ForbiddenError`) is well-structured with status codes, error codes, and optional details.

---

### Domain 12: Logging & Observability

**Findings:**

- **#12 (P1)**: At [authorization.ts:106-110](lib/authorization.ts#L106-L110), the "Admin access granted" log message includes `userId`, `role`, and `path`. While `userId` is acceptable for audit trails, this log fires on every successful admin request and combined with other logs could enable user activity profiling.

- **#60 (P3)**: `logger.warn()` at [logger.ts:197-200](lib/logger.ts#L197-L200) always logs regardless of the configured `LOG_LEVEL`. Only `info` and `debug` have level checks. This means warnings cannot be suppressed in production.

- **#61 (P3)**: Stack traces are stripped in production at [logger.ts:179-181](lib/logger.ts#L179-L181), but the full error object (including custom properties) may still contain sensitive data.

- **#74 (P3)**: `userId` is included in the log context at [logger.ts:149](lib/logger.ts#L149). This is standard for audit trails but increases the PII footprint of log storage.

- **#81 (P4)**: PII redaction covers 30+ sensitive field names at [logger.ts:32-67](lib/logger.ts#L32-L67) — comprehensive coverage of API keys, tokens, financial identifiers, and personal data.

---

### Domain 13: Configuration & Environment

**Findings:**

- **#36 (P2)**: CI build step at [ci.yml:75](/.github/workflows/ci.yml#L75) uses `SUPABASE_JWT_SECRET: placeholder-jwt-secret-for-build`. While this is a build-time placeholder, if it leaks into runtime or is copied to production env, JWT validation is compromised.

- **#37 (P2)**: CI `npm audit` at [ci.yml:127](/.github/workflows/ci.yml#L127) only fails on `critical` level. High-severity vulnerabilities pass CI without blocking.

- **#62 (P3)**: CI uses `NODE_VERSION: '18'` at [ci.yml:10](/.github/workflows/ci.yml#L10). Node.js 18 reached End-of-Life in April 2025. The project should upgrade to Node.js 20 or 22.

---

### Domain 14: Testing Coverage & Quality

**Findings:**

- **#38 (P2)**: Coverage thresholds are set at 60% for lines, functions, branches, and statements. For a financial application handling credits and invoice generation, industry recommendations suggest 80%+ coverage.

- **#63 (P3)**: No integration tests found for the atomic credit deduction + extraction flow (`extractWithCreditDeduction` RPC).

- **#64 (P3)**: No end-to-end tests for the complete extract → review → convert lifecycle, which involves multiple API routes and database operations.

---

### Domain 15: Compliance & Data Protection

**Findings:**

- **#39 (P2)**: GDPR data subject request tracking appears scaffolded in `lib/gdpr/` but completeness of implementation (right to erasure, data portability, consent management) is unknown.

- **#65 (P3)**: Data retention engine in `lib/retention/` is scaffolded but activation and scheduling mechanism is unclear.

- **#82 (P4)**: XML security module at [xml-security.ts:1-306](lib/xml-security.ts#L1-L306) provides comprehensive protection: size limits, DOCTYPE rejection, XXE detection, entity counting (billion laughs defense), and namespace allowlisting for e-invoice standards.

---

### Domain 16: Concurrency & Race Conditions

**Findings:**

- **#40 (P2)**: Batch processor at [batch.processor.ts:434-464](services/batch/batch.processor.ts#L434-L464) deducts credits for multi-invoice expansion in a **separate** call from the initial deduction. If the second deduction fails mid-batch (insufficient credits), some invoices are processed without payment.

- **#41 (P2)**: Failed batch file refund at [batch.processor.ts:470](services/batch/batch.processor.ts#L470) uses `creditsDbService.addCredits()` instead of the idempotent `refundCreditsIdempotent()`. If `recoverStuckJobs()` re-runs the batch, refunds could be applied twice.

- **#66 (P3)**: Batch processor implements its own retry logic with exponential backoff at [batch.processor.ts:20-78](services/batch/batch.processor.ts#L20-L78), separate from the `withRetry` policy in `lib/resilience.ts`. Dual retry paths increase complexity.

- **#67 (P3)**: Circuit breaker is only engaged when `USE_CIRCUIT_BREAKER` flag is ON (default OFF) at [batch.processor.ts:32-37](services/batch/batch.processor.ts#L32-L37). Without the circuit breaker, a failing AI provider will be hammered with retries.

---

### Domain 17: Integration & External Dependencies

**Findings:**

- **#42 (P2)**: `extractWithRetry` at [batch.processor.ts:43-52](services/batch/batch.processor.ts#L43-L52) determines retryability via string matching on error messages (`includes('429')`, `includes('rate limit')`, etc.). This is brittle — a provider changing their error message format would break retry logic.

- **#68 (P3)**: Batch worker trigger in the extract route uses `fetch` with `AbortController` for fire-and-forget. If the network call fails, no retry is attempted.

---

### Domain 18: CI/CD & Supply Chain

**Findings:**

- **#69 (P3)**: No dedicated SAST tool beyond ESLint's `plugin:security/recommended-legacy`. CodeQL runs in a separate workflow.

- **#70 (P3)**: CodeQL workflow is separate from the main CI — may not block PRs if not configured as a required status check.

- **#71 (P3)**: No container image scanning is configured. If the application is deployed via Docker, base image vulnerabilities would go undetected.

- **#83 (P4)**: Schematron validation in CI at [ci.yml:77-111](/.github/workflows/ci.yml#L77-L111) validates generated test invoices against official rules — excellent practice for e-invoicing compliance.

---

## Cross-Cutting Concerns

### 1. Scaffolded-but-Inactive Infrastructure

Multiple critical systems are implemented but disabled by default:

- **BullMQ**: 4 queues defined, 0 workers instantiated (findings #8, #9, #10)
- **XState state machine**: Behind `USE_STATE_MACHINE` flag, default OFF (finding #23)
- **CASL RBAC**: Behind `USE_GRANULAR_RBAC` flag, default OFF (finding #43)
- **Circuit breaker**: Behind `USE_CIRCUIT_BREAKER` flag, default OFF (finding #67)

This creates a **false sense of security** — the code suggests these protections exist, but production runs without them.

### 2. Dual Implementation Anti-Pattern

Two credit services exist with different safety levels (finding #4). Two retry mechanisms exist (finding #66). The deprecated `createUserClient` coexists with `createUserScopedClient` (finding #16). These dualities invite bugs where the unsafe variant is accidentally used.

### 3. AI Provider Trust Boundary

All 3 AI extraction consumers send raw document content to LLMs without input sanitization (findings #5, #6). The extraction normalizer validates output but not input. A malicious document could manipulate extraction results.

### 4. Session Security Gaps

The session system has strong cryptographic foundations (HMAC-SHA256, timing-safe comparison) but implementation gaps: `aud` not validated (#2), request parameter ignored (#13), 7-day TTL (#18), no CSRF (#3), in-process profile cache (#20).

---

## Risk Heatmap

| Domain                | P0    | P1     | P2     | P3     | P4     | Total  |
| --------------------- | ----- | ------ | ------ | ------ | ------ | ------ |
| D1: Structure         | 0     | 0      | 2      | 2      | 1      | 5      |
| D2: Auth/Session      | 0     | 2      | 6      | 2      | 1      | 11     |
| D3: Tenant Isolation  | 0     | 0      | 2      | 0      | 0      | 2      |
| D4: Credit System     | 0     | 1      | 1      | 1      | 0      | 3      |
| D5: State Machine     | 0     | 1      | 2      | 0      | 1      | 4      |
| D6: BullMQ            | 0     | 3      | 0      | 1      | 0      | 4      |
| D7: AI Pipeline       | 0     | 2      | 2      | 2      | 1      | 7      |
| D8: Format Validation | 0     | 0      | 1      | 1      | 1      | 3      |
| D9: API Security      | 1     | 2      | 3      | 3      | 0      | 9      |
| D10: Database         | 0     | 0      | 4      | 2      | 0      | 6      |
| D11: Error Handling   | 0     | 0      | 1      | 1      | 1      | 3      |
| D12: Logging          | 0     | 1      | 0      | 3      | 1      | 5      |
| D13: Config           | 0     | 0      | 2      | 1      | 0      | 3      |
| D14: Testing          | 0     | 0      | 1      | 2      | 0      | 3      |
| D15: Compliance       | 0     | 0      | 1      | 1      | 1      | 3      |
| D16: Concurrency      | 0     | 0      | 2      | 2      | 0      | 4      |
| D17: Integration      | 0     | 0      | 1      | 1      | 0      | 2      |
| D18: CI/CD            | 0     | 0      | 0      | 3      | 1      | 4      |
| **TOTAL**             | **1** | **12** | **31** | **28** | **10** | **82** |

> Note: Finding #82 (XML security — P4-INFO) is listed under D15 but could also apply to D8.

---

## Recommendations Priority Matrix

### P0 — Fix Immediately (1 finding)

1. **Add authentication to `/api/jobs/[jobId]`** — Add `getAuthenticatedUser()` check and job ownership verification. This endpoint exposes internal job data to any unauthenticated caller.

### P1 — Fix Within 1 Sprint (12 findings)

1. Validate `aud` claim in `verifySessionToken()` (#2)
2. Implement CSRF protection (double-submit cookie or custom header) (#3)
3. Remove or deprecate duplicate `CreditService` (#4)
4. Add input sanitization/sandboxing for AI extraction prompts (#5, #6)
5. Replace placeholder `hasCredits` guard with real credit check (#7)
6. Register SIGTERM handler calling `shutdownAllWorkers()` (#8)
7. Wire `handleDeadLetter` to worker `failed` events (#9)
8. Either instantiate BullMQ workers or remove dead code (#10)
9. Apply `withIdempotency()` to extract route (#11)
10. Review and reduce PII in authorization logs (#12)
11. Fix `getAuthenticatedUser` to use the request parameter (#13)

### P2 — Fix Within 1 Month (31 findings)

Priority items: Remove deprecated `createUserClient`, enforce password complexity, implement post-generation XML validation, make credit expansion atomic, use idempotent refunds in batch.

### P3 — Fix in Next Quarter (28 findings)

Focus on: Node.js upgrade, CSP headers, integration tests, retention engine activation.

### P4 — Informational (10 findings)

Document for knowledge base. No action required.

---

_Report generated by Claude Opus 4.6 automated security audit. All findings are based on static code analysis and do not include dynamic testing or penetration testing results._
