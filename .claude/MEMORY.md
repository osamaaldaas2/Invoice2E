# MEMORY.md — Project Memory & Lessons Learned

> This file is the agent's "long-term memory" for this project.
> LLMs have no memory between sessions. Without this file, the same mistakes
> recur every session. The SaaStr incident happened because the agent had
> no memory of previous warnings — 11 warnings were ignored.
>
> This file should be UPDATED after every session. It grows over time.

---

## Project Overview

| Field               | Value                                                                            |
| ------------------- | -------------------------------------------------------------------------------- |
| **Project Name**    | Invoice2E                                                                        |
| **Type**            | Web App (SaaS — invoice extraction & XRechnung conversion)                       |
| **Tech Stack**      | Next.js 16, TypeScript, Supabase, Tailwind CSS 3, React 18, Zod, XState, Zustand |
| **Node Version**    | 24.x (engines: >=18.17.0)                                                        |
| **Package Manager** | npm (>=9.0.0)                                                                    |
| **Database**        | PostgreSQL via Supabase                                                          |
| **AI Providers**    | Google Gemini, DeepSeek (default)                                                |
| **Deployment**      | Vercel                                                                           |
| **Repo URL**        | https://github.com/osamaaldaas2/Invoice2E.git                                    |

---

## Project Structure

```
Invoice2E.1/
├── adapters/            # AI & external service adapters (Gemini, DeepSeek, PayPal, SendGrid)
├── app/                 # Next.js App Router (pages, layouts, API routes)
│   ├── (auth)/          # Auth pages (login, signup, forgot/reset password)
│   ├── admin/           # Admin dashboard pages
│   ├── api/             # API routes (auth, invoices, payments, admin, health, etc.)
│   ├── checkout/        # Payment checkout flow
│   ├── convert/         # Single invoice conversion page
│   ├── dashboard/       # User dashboard pages
│   ├── invoices/        # Bulk upload page
│   └── review/          # Invoice review page
├── components/          # React components (admin, common, dashboard, features, forms, layout, ui)
├── db/                  # Database migrations (001–016)
├── docs/                # Documentation (ADRs, SLOs)
├── domains/             # Domain-driven design modules
├── hooks/               # React custom hooks (useAuth, useUser)
├── i18n/                # Internationalization (next-intl)
├── lib/                 # Shared utilities (extraction-prompt, extraction-normalizer, supabase, auth)
├── public/              # Static assets (images, icons, fonts)
├── scripts/             # Setup & migration scripts
├── services/            # Business logic (AI extraction, batch, email, XRechnung, admin, user, file)
├── styles/              # CSS variables
├── supabase/            # Supabase project config
├── tests/               # Unit & integration tests (Vitest), E2E (Playwright)
└── types/               # TypeScript type definitions
```

---

## Architecture Decisions

<!-- Record WHY decisions were made, not just WHAT was decided -->

### ADR-001: Accepted Risk Documentation Pattern

- **Date**: 2026-02-19
- **Decision**: Created `docs/SECURITY_DECISIONS.md` with 17 accepted risk items (AR-1 through AR-17) rather than fixing every low-priority audit finding
- **Context**: Security audit found 83 findings across 18 domains. Not all warrant code changes — some are informational, some are acceptable at current maturity.
- **Alternatives Considered**: Fix everything (too much scope), ignore (no audit trail)
- **Trade-offs**: Gain explicit risk acceptance with review dates and revisit conditions; lose some hardening that could be done

### ADR-002: Migration-based RPC Fixes (Never Edit Applied Migrations)

- **Date**: 2026-02-19
- **Decision**: Fix broken RPCs by creating NEW migrations with `CREATE OR REPLACE FUNCTION`, never editing already-applied migration files
- **Context**: `refund_credits_idempotent` used wrong column name `type` instead of `transaction_type`. The original migration was already applied to remote DB.
- **Alternatives Considered**: Edit original migration (breaks applied state), manual SQL fix (no audit trail)
- **Trade-offs**: Clean migration history; extra migration file

---

## Project-Specific Conventions

<!-- Things unique to THIS project that the agent must follow -->

```
- Naming: camelCase for variables/functions, PascalCase for components/types, snake_case in DB
- DB↔App mapping: camelToSnakeKeys/snakeToCamelKeys (RECURSIVE, converts JSONB contents)
- API patterns: Supabase RPC for credit operations (idempotency via idempotency_key column)
- Testing: Vitest for unit tests, Playwright for E2E, coverage thresholds 60%
- Git: conventional commits (fix:, feat:, docs:), Husky pre-commit (ESLint + Prettier)
- AI extraction: 1 shared prompt (lib/extraction-prompt.ts), 1 shared normalizer (lib/extraction-normalizer.ts)
- Zod schemas: use z.coerce.string() for fields AI providers may return as numbers (postalCode, documentTypeCode)
- Security: CSP headers in middleware.ts, CORS dynamic origin, PII redaction in logger
```

---

## Verified Dependencies

<!-- Track packages that have been VERIFIED as real and appropriate -->

| Package                | Version | Purpose                             | Verified Date |
| ---------------------- | ------- | ----------------------------------- | ------------- |
| next                   | 16.x    | App framework (App Router)          | 2026-02-19    |
| @supabase/supabase-js  | latest  | DB client + auth                    | 2026-02-19    |
| zod                    | latest  | Schema validation (extraction, API) | 2026-02-19    |
| vitest                 | latest  | Unit testing (1492 tests)           | 2026-02-19    |
| eslint-plugin-security | latest  | Security linting rules              | 2026-02-19    |

---

## Banned Patterns (Project-Specific)

<!-- Things that have caused problems in THIS project -->

| Pattern                                 | Why Banned                                                        | What To Use Instead                                                    | Incident Date |
| --------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------- |
| `z.string()` for AI-returned codes      | AI providers return numbers for documentTypeCode, postalCode      | `z.coerce.string()`                                                    | 2026-02-19    |
| `type` column in credit_transactions    | Column is actually `transaction_type`; caused runtime RPC failure | Always use `transaction_type`                                          | 2026-02-19    |
| Editing applied Supabase migrations     | Breaks migration state on remote DB                               | Create new migration with `CREATE OR REPLACE`                          | 2026-02-19    |
| `eslint-disable` for non-existent rules | Causes lint-staged pre-commit hook failures on the whole file     | Only disable rules that exist in ESLint config                         | 2026-02-19    |
| String matching for retryable errors    | Brittle, breaks on message changes                                | Structured error classification (HTTP status → error codes → fallback) | 2026-02-19    |

---

## Known Gotchas

<!-- Tricky aspects of this codebase that have caused confusion -->

1. **lint-staged runs ESLint on entire file**: Even if you only stage one line, lint-staged runs ESLint on the whole file. Pre-existing `eslint-disable` comments for non-existent rules will block your commit.
2. **credit_transactions column is `transaction_type` not `type`**: The original migration `20260217220400` had this wrong. Fixed in `20260219060000`. Always check actual table schema before writing INSERT statements.
3. **Supabase migrations are immutable once applied**: If a migration has been applied to remote, you can't edit it. Create a new migration with `CREATE OR REPLACE` to fix RPCs.
4. **AI providers return inconsistent types**: Gemini returns postalCode as number, Mistral returns documentTypeCode as number. Always use `z.coerce.string()` for any field that could be either string or number.
5. **`extract_with_credit_deduction` and `refund_credits_idempotent` are separate RPCs**: Fixing one does NOT fix the other. Both need `transaction_type` column, `balance_after` tracking, and `idempotency_key`.

---

## Error Log

<!-- Record significant errors, their causes, and fixes -->

### Error 1: refund_credits_idempotent RPC Failure

- **Date**: 2026-02-19
- **Symptom**: `column "type" of relation "credit_transactions" does not exist` at runtime
- **Root Cause**: Migration `20260217220400_idempotent_refund.sql` line 35 used `type` instead of `transaction_type`. A later fix migration (`20260218153000`) fixed `extract_with_credit_deduction` but missed this RPC.
- **Fix Applied**: New migration `20260219060000_fix_refund_rpc_column_name.sql` — `CREATE OR REPLACE FUNCTION` with correct column name + `balance_after` tracking
- **Prevention**: Always cross-reference actual table DDL when writing INSERT statements for RPCs
- **Lesson**: When fixing one RPC, grep for ALL RPCs that touch the same table.

### Error 2: Mistral documentTypeCode Zod Rejection

- **Date**: 2026-02-19
- **Symptom**: `documentTypeCode: Expected string, received number` — extraction fails with 422
- **Root Cause**: Mistral returns `documentTypeCode: 380` (number) but Zod expected `z.string()`
- **Fix Applied**: Changed to `z.coerce.string().max(10).optional()` in `lib/extraction-validation.ts:76`
- **Prevention**: Use `z.coerce.string()` for all AI-returned fields that could be string or number
- **Lesson**: Same pattern as postalCode — AI providers are inconsistent about string vs number types.

### Error 3: ESLint Pre-commit Hook Failure

- **Date**: 2026-02-19
- **Symptom**: `Definition for rule '@typescript-eslint/no-require-imports' was not found` — commit blocked
- **Root Cause**: Pre-existing `eslint-disable-next-line @typescript-eslint/no-require-imports` comment in `lib/logger.ts:120` referenced a rule not in the ESLint config. lint-staged triggered ESLint on the full file.
- **Fix Applied**: Removed the stale eslint-disable comment
- **Prevention**: Only add eslint-disable comments for rules that actually exist in the project's ESLint config
- **Lesson**: lint-staged processes the whole file, not just staged lines — pre-existing issues surface.

---

## Session Log

<!-- Brief summary of each working session -->

### Session 2026-02-18 / 2026-02-19 (Security Remediation — 4 Stages)

- **Tasks Completed**:
  - Stage 1: 5 P1-HIGH fixes (auth cookie, deprecated export, password policy, atomic credits, batch credit expansion)
  - Stage 2: 5 P2-MEDIUM fixes (credit checks, request cookie auth, worker handlers, dead letter queue, circuit breaker docs)
  - Stage 3: 6 P3-LOW fixes (CSP headers, Node 20 CI, npm audit level, AI adapter hardening, CORS, Supabase config)
  - Stage 4: 12 fixes + 17 accepted risk docs + SECURITY_DECISIONS.md + 2 runtime bug fixes
  - Total: 34+ fixes across 83 audit findings, 11 Stage 4 commits
- **Decisions Made**: Accepted risk documentation pattern (ADR-001), migration-based RPC fixes (ADR-002)
- **Issues Encountered**: ESLint pre-commit hook failure (stale eslint-disable), refund RPC wrong column name, Mistral returning number for documentTypeCode
- **Open Items**:
  - ~~CRITICAL: Apply migration `20260219060000_fix_refund_rpc_column_name.sql`~~ — **DONE** (applied via Supabase SQL Editor 2026-02-19)
  - **OPS-1**: Enable CodeQL as required status check in GitHub repo settings
  - Legacy `session_user_id` cookie cleanup TODO expires 2026-03-19
- **Lessons Learned**: Always grep ALL RPCs when fixing a shared table's column usage; AI providers are inconsistent about string vs number types

---

## Environment-Specific Notes

### Development

- Local Supabase may not always be running — check before assuming migrations auto-apply
- Windows `/tmp/` maps to `C:\tmp\` which may not exist — avoid temp file redirection in scripts

### Staging

- Migrations applied via `npx supabase db push` or manual SQL in Supabase SQL Editor

### Production

- CSP headers enforced via middleware.ts (not next.config.js headers)
- CORS origin is dynamic per-request from `ALLOWED_ORIGINS` env var
- Credit refund depends on `refund_credits_idempotent` RPC — verify migration applied before testing

---

## ⚠️ Update Instructions

**After every session, the agent should:**

1. Add any new architecture decisions to the ADR section
2. Log any errors encountered in the Error Log
3. Add a Session Log entry summarizing the work
4. Update Verified Dependencies if new packages were added
5. Add to Banned Patterns if new anti-patterns were discovered
6. Update Known Gotchas if new surprises were found

**The human should review and approve MEMORY.md updates**, as this file
influences all future agent behavior on this project.
