# Invoice2E Codebase Discovery Report

**Date:** 2026-02-13
**Project:** invoice2e.eu
**Supabase Project:** wmmpneexdrxjvnrnohep (eu-west-1)

---

## Phase 1 -- Database Layer (Supabase)

### 1.1 Schema Overview

**15 public tables**, 1 storage bucket, 0 Edge Functions. Single tracked migration (`003_transaction_functions`), meaning the bulk of the schema was created via the Supabase dashboard or ad-hoc SQL, not through the migration system.

#### Public Tables (Row Counts)

| Table | Rows | RLS Enabled | Purpose |
|-------|------|-------------|---------|
| `users` | 2 | Yes | User accounts with bcrypt password hashes |
| `user_credits` | 2 | Yes | Credit balances per user |
| `invoice_extractions` | 1,757 | Yes | AI extraction results (Gemini) |
| `invoice_conversions` | 310 | Yes | XRechnung XML conversions |
| `credit_transactions` | 57 | Yes | Credit ledger (debits/credits) |
| `audit_logs` | 57 | Yes | General audit trail |
| `batch_jobs` | 17 | Yes | Bulk upload batch processing |
| `admin_audit_logs` | 3 | Yes | Admin-specific actions |
| `credit_packages` | 3 | Yes | Purchasable credit bundles |
| `payment_transactions` | 0 | Yes | Stripe/PayPal payment records |
| `webhook_events` | 0 | Yes | Idempotency for payment webhooks |
| `vouchers` | 0 | Yes | Discount/promo voucher codes |
| `voucher_redemptions` | 0 | Yes | Voucher usage tracking |
| `user_templates` | 0 | Yes | Saved invoice templates |
| `password_reset_tokens` | 0 | Yes | Password reset flow |

### 1.2 Entity Relationship Graph

```
auth.users (Supabase Auth -- NOT USED for app auth)
    |
    +-- user_templates.user_id -> auth.users.id  (NOTE: FK points to auth.users, not public.users!)

public.users (App-managed users with bcrypt)
    |
    +-- user_credits.user_id
    +-- invoice_extractions.user_id
    +-- invoice_conversions.user_id
    +-- payment_transactions.user_id
    +-- credit_transactions.user_id
    +-- audit_logs.user_id
    +-- admin_audit_logs.admin_user_id
    +-- admin_audit_logs.target_user_id
    +-- batch_jobs.user_id
    +-- webhook_events.user_id
    +-- voucher_redemptions.user_id
    +-- password_reset_tokens.user_id

invoice_extractions
    |
    +-- invoice_conversions.extraction_id

vouchers
    |
    +-- voucher_redemptions.voucher_id
```

**Critical FK anomaly:** `user_templates.user_id` references `auth.users.id` (Supabase Auth) instead of `public.users.id`. Since the app uses custom auth (public.users), templates will fail to create with FK violations if user IDs don't match.

### 1.3 Custom Enum Types

- `user_role`: `{user, admin, super_admin}`

### 1.4 RLS Policies Summary

All 15 public tables have RLS enabled. Policies follow a consistent pattern:

- **User data isolation:** Most tables use `user_id = auth.uid()` for SELECT/INSERT/UPDATE
- **Admin access:** Admin-visible tables (users, conversions, credits, transactions) add `OR is_admin(auth.uid())`
- **Super admin gates:** DELETE on `credit_packages` and `vouchers` requires `is_super_admin()`
- **Public read:** `credit_packages` and `vouchers` allow SELECT when `is_active = true`

**Issues detected:**

- `password_reset_tokens`: RLS policy "Service role manages reset tokens" uses `USING (true) WITH CHECK (true)` for ALL operations, applied to the `public` role. This means ANY authenticated user (or even anon with the anon key) can read, insert, update, and delete ALL password reset tokens. This is a critical security vulnerability.
- `webhook_events`: Correctly restricted to `service_role` only.
- `voucher_redemptions` and `credit_transactions`: Only have SELECT policies. INSERT is handled by SECURITY DEFINER functions, which is correct.

### 1.5 Custom Functions (13 total)

| Function | Security | search_path | Purpose |
|----------|----------|-------------|---------|
| `is_admin(uuid)` | DEFINER | SET '' | Check if user is admin/super_admin |
| `is_super_admin(uuid)` | DEFINER | SET '' | Check if user is super_admin |
| `add_credits(uuid, int, varchar, varchar)` | DEFINER | **NOT SET** | Add credits + audit log |
| `safe_deduct_credits(uuid, int, varchar)` | DEFINER | **NOT SET** | Atomic credit deduction with row lock |
| `deduct_credits(uuid, int, varchar, varchar)` | DEFINER | SET '' | Alternative deduction function |
| `verify_and_add_credits(uuid, int, varchar, varchar, varchar, varchar)` | DEFINER | **NOT SET** | Idempotent credit addition via webhook_events |
| `convert_invoice_with_credit_deduction(uuid, uuid, int)` | DEFINER | SET '' | Combined conversion + credit deduction |
| `admin_modify_credits(uuid, uuid, int, text, varchar, text)` | DEFINER | SET '' | Admin credit adjustment |
| `redeem_voucher(uuid, varchar)` | DEFINER | SET '' | Full voucher redemption flow |
| `setup_first_admin(text)` | DEFINER | SET '' | One-time admin bootstrap |
| `increment_login_count()` | INVOKER | SET '' | Trigger function for login tracking |
| `update_updated_at_column()` | INVOKER | SET '' | Generic timestamp trigger |
| `update_credit_packages_updated_at()` | INVOKER | SET '' | Timestamp trigger for packages |

**Security warnings (from Supabase advisor):**
- `verify_and_add_credits`, `add_credits`, `safe_deduct_credits` have mutable search_path -- potential search_path injection risk.

### 1.6 Triggers

| Trigger | Table | Event | Function |
|---------|-------|-------|----------|
| `update_users_updated_at` | users | UPDATE | `update_updated_at_column()` |
| `trigger_increment_login_count` | users | UPDATE | `increment_login_count()` |
| `update_user_credits_updated_at` | user_credits | UPDATE | `update_updated_at_column()` |
| `update_invoice_extractions_updated_at` | invoice_extractions | UPDATE | `update_updated_at_column()` |
| `update_invoice_conversions_updated_at` | invoice_conversions | UPDATE | `update_updated_at_column()` |
| `update_payment_transactions_updated_at` | payment_transactions | UPDATE | `update_updated_at_column()` |
| `update_batch_jobs_updated_at` | batch_jobs | UPDATE | `update_updated_at_column()` |
| `update_user_templates_updated_at` | user_templates | UPDATE | `update_updated_at_column()` |
| `trigger_update_credit_packages_updated_at` | credit_packages | UPDATE | `update_credit_packages_updated_at()` |
| `update_vouchers_updated_at` | vouchers | UPDATE | `update_updated_at_column()` |

### 1.7 Indexes

43 indexes across public tables. All PKs are UUID-based btree. Notable:

- `unique_webhook_event` on `(event_id, provider)` -- idempotency enforcement
- `idx_vouchers_code_lower` UNIQUE on `lower(code)` -- case-insensitive voucher lookup
- `idx_user_credits_user_id_unique` UNIQUE on `user_id` -- enforces 1:1 with users
- **Unused indexes:** `idx_password_reset_tokens_hash` and `idx_password_reset_tokens_expires` (feature not yet used in production)
- **Missing indexes:** `password_reset_tokens.user_id` FK and `voucher_redemptions.voucher_id` FK lack covering indexes

### 1.8 Storage

Single bucket: `batch-inputs` (private, no file size limit, no MIME type restriction, 81 objects). No storage-level RLS policies found on objects -- access relies on application-level controls.

### 1.9 Installed Extensions

Active: `pgcrypto`, `pg_stat_statements`, `supabase_vault`, `pg_graphql`, `uuid-ossp`, `plpgsql`

### 1.10 Edge Functions

None deployed.

### 1.11 Migration Gap

Only 1 migration tracked (`003_transaction_functions`). The full schema (15 tables, 13 functions, 10+ triggers, 40+ indexes) was created outside the migration system. This means schema changes cannot be reliably replicated across environments.

---

## Phase 2 -- Data Patterns

### 2.1 Activity Timeline

- **First user created:** 2026-01-31 (osamaaldaas@outlook.de)
- **Second user created:** 2026-02-09 (israa.aldaas@icloud.com) -- zero activity
- **First extraction:** 2026-02-10 22:35
- **Last extraction:** 2026-02-12 15:28
- **Active usage window:** ~3 days of intensive testing

### 2.2 Status Distributions

**Extractions:** 1,658 completed, 99 drafts (94.4% completion rate)
**Conversions:** All 310 completed (100%)
**Validation:** 308 valid, 2 with warnings
**Batch jobs:** 14 completed, 2 failed, 1 stuck in processing
**Conversion format:** 293 "XRechnung" + 17 "xrechnung" (case inconsistency)

### 2.3 Credit Reconciliation

User `osamaaldaas@outlook.de`:
- Available: 3,343 | Used: 1,681
- Credits in (from transactions): 24 | Debits (from transactions): 1,681
- Expected balance from transactions: 24 - 1,681 = -1,657
- **Actual balance: 3,343** -- massive discrepancy

The credit_transactions table only tracks 24 credits added and 1,681 deducted, yet the user has 3,343 available. This means credits were added directly via SQL or admin functions without corresponding credit_transaction records, or the `add_credits` function was called before the credit_transactions logging was added.

### 2.4 JSONB Structure (extraction_data)

Core fields present in all 1,757 records: `invoice_number`, `invoice_date`, `seller_name`, `seller_address`, `seller_city`, `seller_postal_code`, `seller_country_code`, `seller_tax_id`, `seller_email`, `seller_phone`, `seller_iban`, `seller_bic`, `bank_name`, `buyer_name`, `buyer_address`, `buyer_city`, `buyer_postal_code`, `buyer_country_code`, `buyer_email`, `buyer_tax_id`, `line_items`, `subtotal`, `tax_amount`, `total_amount`, `currency`, `payment_terms`, `notes`

Optional fields: `confidence` (1,740), `processing_time_ms` (1,740), `tax_rate` (1,740), `buyer_phone` (1,740), `buyer_reference` (18), `payment_due_date` (17), `items` (17 -- duplicate of line_items?), `seller_electronic_address` (11), `_original_extraction` (9 -- suggests re-processing)

### 2.5 AI Performance

- Average confidence: 0.988 (range: 0.900 -- 1.000)
- Average Gemini response time: 12,254ms (range: 5,966 -- 17,208ms)
- 1,743 of 1,757 extractions have NULL `gemini_response_time_ms` (column-level, not from JSONB)

### 2.6 Batch Processing

17 batch jobs processed. Typical pattern: 132-file ZIP uploads (zip_upload source) and 30-file multi-invoice splits. Processing time for 132 files: ~2-6 minutes. One job stuck in "processing" status (29/30 completed, 1 failed) -- never transitioned to completed/failed.

### 2.7 Credit Packages (Live Data)

| Slug | Name | Credits | Price (EUR) | Stripe ID | PayPal ID |
|------|------|---------|-------------|-----------|-----------|
| starter | Starter Pack | 10 | 9.99 | NULL | NULL |
| professional | Professional Pack | 50 | 39.99 | NULL | NULL |
| enterprise | Enterprise Pack | 100 | 69.99 | NULL | NULL |

**Payment integration not connected:** All `stripe_price_id` and `paypal_plan_id` are NULL. Zero payment_transactions and zero webhook_events confirm payments have never been processed through the system.

---

## Phase 3 -- Frontend / Application Code

### 3.1 Framework & Stack

- **Framework:** Next.js 16.1.6 (App Router) with React 18
- **Language:** TypeScript
- **Styling:** Tailwind CSS 3.3
- **State:** Zustand 4.4 (client), React Query 5.20 (server state)
- **Forms:** React Hook Form 7.47 + Zod 3.22
- **i18n:** next-intl 4.8.2 (EN/DE)
- **Icons:** lucide-react 0.263
- **AI:** @google/generative-ai 0.24.1
- **Payments:** Stripe (via adapter), PayPal (via adapter)
- **Email:** SendGrid (via adapter)
- **PDF:** pdf-lib 1.17.1 (splitting), JSZip 3.10.1 (batch)
- **Auth:** Custom bcrypt + HMAC session tokens (jose 6.1.3)
- **Rate limiting:** @upstash/ratelimit + @upstash/redis (with in-memory fallback)
- **Error tracking:** @sentry/nextjs 10.38
- **Testing:** Vitest 4.0.18 + Testing Library
- **Linting:** ESLint 9 + eslint-plugin-security + Prettier
- **Git hooks:** Husky + lint-staged

### 3.2 Routing Structure

**Auth routes** (unauthenticated):
- `/(auth)/login`, `/(auth)/signup`, `/(auth)/forgot-password`, `/(auth)/reset-password`

**Main app routes** (authenticated):
- `/` -- Landing page
- `/dashboard` -- Main dashboard with stats
- `/dashboard/history` -- Conversion history
- `/dashboard/credits` -- Credit balance & purchase
- `/dashboard/analytics` -- Usage analytics
- `/dashboard/profile` -- User profile
- `/dashboard/templates` -- Saved invoice templates
- `/convert/[extractionId]` -- Convert extracted data to XRechnung
- `/review/[extractionId]` -- Review/edit extracted invoice data
- `/invoices/bulk-upload` -- Batch ZIP upload
- `/pricing` -- Credit package pricing
- `/checkout`, `/checkout/success`, `/checkout/cancel` -- Payment flow

**Admin routes:**
- `/admin` -- Admin dashboard
- `/admin/users`, `/admin/users/[id]` -- User management
- `/admin/transactions` -- Payment transactions
- `/admin/audit-logs` -- Audit log viewer
- `/admin/packages` -- Credit package management
- `/admin/vouchers` -- Voucher management

### 3.3 API Routes (30+ endpoints)

**Auth:** login, signup, logout, me, forgot-password, reset-password
**Invoices:** extract (POST + GET poll), convert, review, bulk-upload, history, analytics, templates, batch-download, extractions/[id]
**Payments:** create-checkout, verify, webhook, history
**Credits:** history, usage
**Packages:** list
**Vouchers:** redeem
**Users:** profile
**Admin:** stats, users CRUD, ban, credits modify, transactions, refund, packages CRUD, vouchers CRUD, audit-logs
**Internal:** batch-worker
**Health:** health check

### 3.4 Authentication Flow

The app does NOT use Supabase Auth. Instead:

1. **Signup:** Email + password stored in `public.users` with bcrypt hash. User gets initial credits (currently 0).
2. **Login:** Bcrypt comparison, then HMAC-SHA256 signed session token set as HttpOnly cookie (`session_token`).
3. **Session format:** `v1.base64(payload).hmac_signature` containing userId, email, name, role, issuedAt, expiresAt (1 week TTL with sliding window renewal at 3.5 days).
4. **API auth:** `getAuthenticatedUser()` reads cookie, verifies HMAC signature + expiration.
5. **RLS integration:** `createUserScopedClient(userId)` mints a short-lived JWT (15min) signed with `SUPABASE_JWT_SECRET`, setting `sub` to userId and `role` to `authenticated`. This makes `auth.uid()` work in RLS policies.
6. **Admin client:** `createAdminClient()` uses service_role key, bypasses RLS. Used for admin operations and background jobs.

### 3.5 File Upload Pipeline

1. User uploads PDF/JPG/PNG via `FileUploadForm` component
2. `POST /api/invoices/extract` receives FormData
3. File validated (max 25MB, allowed MIME types)
4. Rate limit checked (10 req/min per user)
5. For PDFs: boundary detection runs (Gemini AI identifies if multi-invoice)
6. Credits deducted atomically BEFORE AI call
7. Single invoice: Gemini extracts data, saved to `invoice_extractions`
8. Multi-invoice (<=3): Split PDF, parallel extraction
9. Multi-invoice (>3): Background batch job created, worker triggered
10. On extraction failure: credits refunded

### 3.6 XRechnung Generation

Built in `services/xrechnung/builder.ts`:
- Generates UN/CEFACT CII (Cross-Industry Invoice) XML format
- XRechnung 3.0 compliant (`urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0`)
- Handles line items, tax calculations, seller/buyer parties, payment terms
- Validation via `services/xrechnung/validator.ts`
- Vendor directory contains EN16931 validation schematron/XSLT files and KoSIT validator JAR

### 3.7 Adapter Pattern

Clean adapter abstraction layer separating external service interfaces:
- `IGeminiAdapter`, `IDeepSeekAdapter` -- AI providers
- `IStripeAdapter`, `IPayPalAdapter` -- Payment processors
- `ISendGridAdapter` -- Email service
- `ISupabaseAdapter` -- Database client

This enables easy testing (mock adapters) and provider swapping.

### 3.8 i18n

Two locale files: `messages/en.json` and `messages/de.json`. Locale stored in cookie (`locale`), default `en`. Managed via `next-intl` with middleware setting default cookie if missing.

### 3.9 Testing

44 test files covering:
- Unit tests for adapters (6), services (8), lib utilities (15), routes (7), and specialized tests (8)
- Integration test placeholder exists but likely empty
- No E2E tests detected (no Playwright/Cypress config)

---

## Phase 4 -- Backend / API Layer

### 4.1 Architecture

No separate backend server. Everything runs as Next.js API routes (serverless functions on Vercel). The architecture is:

```
Browser -> Next.js API Routes -> Services -> Adapters -> External APIs
                                    |
                                    +-> Supabase (Postgres + Storage)
```

### 4.2 Background Processing

`/api/internal/batch-worker` handles async batch processing:
- Secured with `BATCH_WORKER_SECRET` header
- Triggered via fire-and-forget fetch from the extract route
- Self-healing: extract poll endpoint re-triggers worker if job stuck in pending >10s
- Max duration: 120 seconds (Vercel config)

### 4.3 Webhook Handling

Single endpoint `/api/payments/webhook?provider=stripe|paypal`:
- Stripe: signature verification via `constructWebhookEvent`
- PayPal: header-based signature verification
- Idempotency via `webhook_events` table (UNIQUE on event_id + provider)
- Credits added via `verify_and_add_credits` DB function
- Rate limited

### 4.4 Email

SendGrid integration via adapter. Templates for: welcome, conversion confirmation, payment confirmation, error notification, password reset. Emails are HTML with plain-text fallback.

### 4.5 Rate Limiting

Dual-layer: Upstash Redis (production) with in-memory fallback (development). Presets:
- Login: 5/15min
- API: 100/min
- Upload: 10/min
- Extract: 10/min
- Bulk: 5/min
- Signup: 10/15min

Additionally, Gemini API calls have a token bucket rate limiter (5 burst, 2/sec sustained).

### 4.6 Error Tracking

Sentry configured for client, server, and edge. Production-only, 10% trace sample rate, session replay enabled (10% normal, 100% on error). Filters ChunkLoadError and common non-actionable errors.

---

## Phase 5 -- Infrastructure & Deployment

### 5.1 Hosting

**Vercel** (confirmed by `vercel.json`):
- Region: `fra1` (Frankfurt -- close to users and Supabase eu-west-1)
- Framework: Next.js
- Build: `npm ci` + `npm run build`

### 5.2 Function Configuration

| Route | Max Duration | Memory |
|-------|-------------|--------|
| Default API routes | 30s | 1024MB |
| `/api/invoices/extract` | 60s | 1024MB |
| `/api/invoices/bulk-upload` | 60s | 1024MB |
| `/api/internal/batch-worker` | 120s | 1024MB |

### 5.3 CI/CD

GitHub Actions with 4 jobs:
1. **Lint & Type Check** -- ESLint + tsc --noEmit
2. **Test** -- Vitest with coverage, uploaded to Codecov
3. **Build** -- Next.js build with dummy env vars
4. **Security Audit** -- npm audit, Gitleaks secret scanning, CycloneDX SBOM

Branches: main, develop, coderabbit-review. Also has CodeQL analysis workflow.

### 5.4 Security Headers

Comprehensive headers set via both `next.config.js` and `vercel.json`:
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security: max-age=31536000
- Content-Security-Policy (script, style, connect, frame sources defined)
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(), geolocation=()

### 5.5 CORS

Middleware-based CORS handling. Configurable via `CORS_ALLOWED_ORIGINS` env var. Same-origin requests are always allowed. Preflight (OPTIONS) handled explicitly.

---

## Phase 6 -- Security Audit

### 6.1 Critical Issues

**`password_reset_tokens` RLS Policy (CRITICAL)**
The policy "Service role manages reset tokens" applies `USING (true) WITH CHECK (true)` to the `public` role for ALL commands. Any user with the anon key can enumerate, steal, or delete password reset tokens, enabling account takeover.

**3 Functions Missing `search_path` (HIGH)**
`verify_and_add_credits`, `add_credits`, `safe_deduct_credits` don't set `search_path`. An attacker who can create objects in a schema earlier in the search path could shadow table names and intercept queries.

**`user_templates` FK Points to auth.users (MEDIUM)**
Since the app uses `public.users` for authentication, this FK will prevent template creation unless the user_id coincidentally exists in `auth.users`.

### 6.2 Authentication Security

- Passwords hashed with bcrypt (10 rounds) -- good
- Sessions use HMAC-SHA256 with timing-safe comparison -- good
- HttpOnly, Secure (production), SameSite=lax cookies -- good
- Sliding window session renewal -- good
- Legacy `session_user_id` cookie cleared on login -- good
- Download URLs signed with HMAC -- good
- Password reset uses hashed tokens with 1-hour expiry -- good
- `SESSION_SECRET` required in production (throws if missing) -- good

### 6.3 Input Validation

- Zod schemas for signup/login validation
- `INPUT_LIMITS` constants prevent oversized strings
- DOMPurify available for HTML sanitization
- File type and size validation on uploads
- Rate limiting on all critical endpoints

### 6.4 Data Access Security

- User-scoped Supabase client (`createUserScopedClient`) mints short-lived JWTs for RLS enforcement
- Admin client clearly separated (`createAdminClient`) with deprecation warnings on legacy functions
- Service role key only used server-side
- RLS policies consistently enforce user isolation

### 6.5 Payment Security

- Stripe webhook signatures verified (async-aware fix noted)
- PayPal webhook signatures verified with fail-closed behavior
- Idempotent credit allocation via unique constraint on `webhook_events`
- However: payment integration is not yet connected (all stripe_price_id/paypal_plan_id are NULL)

### 6.6 Secrets Management

- `.env.local` exists (not in .gitignore explicitly but .gitignore has `*.local` likely)
- `.env.example` documents all required vars without real values -- good
- CI uses Gitleaks for secret scanning -- good
- No hardcoded secrets found in scanned source code

### 6.7 Missing Security Controls

- No CSRF protection beyond SameSite cookies
- `credit_packages` SELECT allows unauthenticated read when `is_active = true` (by design, but means pricing is public via Supabase API)
- `vouchers` SELECT allows unauthenticated read when `is_active = true` (potential information leak of active voucher existence, though codes aren't exposed)
- No account lockout after failed password resets
- Storage bucket `batch-inputs` has no file size limit and no MIME type restrictions
- No storage-level RLS policies on `batch-inputs` objects

---

## Summary of Issues

### Critical

1. **`password_reset_tokens` RLS allows unrestricted public access** -- any user can read/write/delete all tokens, enabling account takeover
2. **3 SECURITY DEFINER functions have mutable search_path** -- potential search_path injection

### High

3. **Credit balance doesn't reconcile with transaction history** -- 3,343 available credits but only 24 credits added via tracked transactions
4. **1 batch job permanently stuck in "processing"** -- 29/30 completed but job never finalized
5. **Schema not tracked in migrations** -- only 1 migration exists for 15 tables, making environment replication unreliable
6. **Payment integration not connected** -- all Stripe/PayPal IDs are NULL, zero transactions processed

### Medium

7. **`user_templates` FK references `auth.users` instead of `public.users`** -- templates feature will fail
8. **Conversion format case inconsistency** -- 293 "XRechnung" vs 17 "xrechnung"
9. **Storage bucket has no size/type restrictions** -- potential abuse vector
10. **2 unused indexes on `password_reset_tokens`** -- minor performance waste

### Low

11. **2 unindexed foreign keys** -- `password_reset_tokens.user_id`, `voucher_redemptions.voucher_id`
12. **Duplicate extraction_data fields** -- `items` (17 records) appears alongside `line_items` (1,757 records)
13. **`gemini_response_time_ms` column mostly NULL** -- 1,743/1,757 are NULL (time tracked in JSONB `processing_time_ms` instead)
14. **99 extractions in "draft" status** -- unclear if these are intentional or abandoned
15. **`nul` file in project root** -- likely accidental creation (Windows NUL device redirect)

### Dormant Features (Implemented but Unused)

- Voucher system (0 vouchers, 0 redemptions)
- Payment processing (0 transactions, 0 webhook events)
- User templates (0 templates, broken FK)
- Password reset (0 tokens)
- Second user account (0 activity)
- DeepSeek AI provider (adapter exists, not active)

---

## Architecture Diagram

```
[Browser] -- HTTPS --> [Vercel / Next.js App Router (fra1)]
                              |
                    +---------+---------+
                    |                   |
              [API Routes]        [React Pages]
                    |                   |
              [Services Layer]    [Components]
                    |                   |
              [Adapter Layer]     [Zustand + React Query]
                    |
        +-----------+-----------+
        |           |           |
   [Supabase]  [Gemini AI]  [Stripe]
   (Postgres    (Extraction)  (Payments - NOT CONNECTED)
    + Storage)
        |
   [SendGrid]   [PayPal]    [Upstash Redis]
   (Email)       (Payments   (Rate Limiting)
                  - NOT CONNECTED)
```

---

*End of Discovery Report*
