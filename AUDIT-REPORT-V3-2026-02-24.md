# Invoice2E Audit Report V3

## Date: 2026-02-24
## Auditor: Claude Opus (Independent Full Codebase Audit)

### Executive Summary
- Total findings: **23**
- P0-CRITICAL: **1**
- P1-HIGH: **4**
- P2-MEDIUM: **7**
- P3-LOW: **7**
- P4-INFO: **4**
- Domains with critical/high findings: Financial Logic, Security, Data Integrity, New Feature (Invoice PDF)
- Highest-risk area: **New invoice PDF feature** — recently added, has multiple issues including missing RLS enforcement and duplicate invoice risk from concurrent webhook + verify paths.

**Note:** 19 accepted risks from `docs/SECURITY_DECISIONS.md` (AR-1 through AR-19) were reviewed and NOT re-reported. Their mitigations remain appropriate.

---

### Findings

#### [F-001] Invoice table missing FORCE ROW LEVEL SECURITY — P1-HIGH
- **Domain**: Security
- **Location**: `supabase/migrations/20260224210000_create_invoices_table.sql:41`
- **Problem**: The `invoices` table has `ENABLE ROW LEVEL SECURITY` but NOT `FORCE ROW LEVEL SECURITY`. Every other tenant-scoped table in the codebase uses `FORCE` (via migration `20260217220200_force_rls_all_tables.sql`). Without `FORCE`, the table owner role bypasses RLS entirely.
- **Impact**: In Supabase Cloud, the `postgres` role (table owner) could read/write all invoices without RLS checks. While the application doesn't use the `postgres` role directly, this is an inconsistency that weakens defense-in-depth.
- **Fix**: 
```sql
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
```

#### [F-002] Stripe webhook and verify endpoint can both generate invoices — P0-CRITICAL
- **Domain**: Financial Logic / Data Integrity
- **Location**: `services/payment-processor.ts:324`, `app/api/payments/verify/route.ts:260`
- **Problem**: Both the Stripe webhook handler (`handleStripeWebhook`) and the verify endpoint generate invoices independently. The unique index on `payment_transaction_id` (added in audit fix migration `20260224221500`) mitigates duplicate inserts, BUT: the webhook uses the Stripe event ID for idempotency (`verify_and_add_credits` with `eventId`), while verify uses `verify_{sessionId}`. The webhook has idempotency check #1 that looks for `verify_{sessionId}`, but the verify endpoint does NOT check for the webhook event. **If both fire simultaneously**, the unique constraint prevents duplicate invoices, but both paths attempt to send emails — the customer could receive **two payment confirmation emails** for the same purchase.
- **Impact**: Customer receives duplicate emails. Invoice number sequence burns an extra number (wasted by the unique constraint rejection). Race window is small but real in production.
- **Reproduction**: Complete a Stripe payment. The success page calls `/api/payments/verify` immediately. Stripe fires the webhook within seconds. Both paths hit `invoiceDbService.createInvoice()` concurrently.
- **Fix**: In the verify endpoint's invoice creation block, wrap the email send inside the `createInvoice` success path only (not in a separate try/catch that could fire even if createInvoice returned an existing record). Alternatively, move invoice generation exclusively to the webhook path and let verify only look up existing invoices.

#### [F-003] Verify endpoint uses user-scoped Supabase for payment transaction lookup before admin client switch — P1-HIGH
- **Domain**: Security / Reliability
- **Location**: `app/api/payments/verify/route.ts` (the `createUserScopedClient` import was removed but there may be other RLS-blocked paths)
- **Problem**: After the audit fixes, the verify route was changed to use `adminSupabaseForTx` for the transaction lookup. However, the `createUserScopedClient` import was removed entirely. If any future code in this file re-introduces a user-scoped client for `payment_transactions`, it will silently fail (return no rows) since `payment_transactions` only has `service_role` RLS policies.
- **Impact**: Currently mitigated by using admin client. Risk is future regression.
- **Fix**: Add a code comment at the top of the verify route: `// WARNING: payment_transactions table has service_role-only RLS. Always use admin client for queries.`

#### [F-004] Invoice VAT calculation uses `Math.round` instead of monetary library — P2-MEDIUM
- **Domain**: Financial Logic
- **Location**: `services/invoice/invoice.db.service.ts:72-73` (`computeVatBreakdown`)
- **Problem**: 
```typescript
const amountNet = Math.round((amountGross / 1.19) * 100) / 100;
const amountVat = Math.round((amountGross - amountNet) * 100) / 100;
```
The codebase has a proper `monetary.ts` library with `roundMoney()`, `toCents()`, and `computeTax()` that handle IEEE 754 edge cases. The invoice code doesn't use them.
- **Impact**: Floating-point edge cases could produce invoices where `net + vat ≠ gross` by €0.01. Example: €39.99 / 1.19 = 33.6050420... → Math.round gives 33.61, VAT = 6.38, total = 39.99 ✓. But for certain amounts, the naive approach may drift.
- **Fix**: Use `roundMoney(amountGross / 1.19)` from `@/lib/monetary` and `subtractMoney(amountGross, amountNet)` for the VAT portion.

#### [F-005] Invoice PDF generator reads logo from filesystem — fragile in serverless — P2-MEDIUM
- **Domain**: Reliability
- **Location**: `services/invoice/invoice-pdf.service.ts:153-158`
- **Problem**: `fs.readFile(path.join(process.cwd(), 'public', 'images', 'logo.png'))` reads from the filesystem. On Vercel serverless, `public/` files may not be available at the expected path in all deployment configurations (especially with standalone output).
- **Impact**: Logo silently falls back to text. Not a functional failure but degrades professionalism of invoices in production.
- **Fix**: Embed the logo as a base64 constant at build time (import as a module), or use Supabase Storage for the logo.

#### [F-006] `console.log` statements in production code — P3-LOW
- **Domain**: Code Quality
- **Location**: 69 occurrences across codebase
- **Problem**: 69 `console.log/warn/error` calls exist outside test files. The codebase has a structured `logger` with PII redaction, correlation IDs, and level control. `console.log` bypasses all of these.
- **Impact**: PII could leak into unstructured stdout. Inconsistent log format makes monitoring harder.
- **Fix**: Replace all `console.*` calls with `logger.*` equivalents. Add an ESLint rule: `"no-console": "error"`.

#### [F-007] Missing `noFallthroughCasesInSwitch` in tsconfig — P3-LOW
- **Domain**: Code Quality
- **Location**: `tsconfig.json`
- **Problem**: `noFallthroughCasesInSwitch` is not enabled. All other strict options are on.
- **Impact**: Accidental switch fallthrough bugs won't be caught at compile time.
- **Fix**: Add `"noFallthroughCasesInSwitch": true` to `compilerOptions`.

#### [F-008] CSP allows `unsafe-eval` and `unsafe-inline` for scripts — P2-MEDIUM
- **Domain**: Security
- **Location**: `next.config.js:52`, `middleware.ts:25`
- **Problem**: `script-src` includes `'unsafe-eval'` and `'unsafe-inline'`. This significantly weakens the Content Security Policy. `unsafe-eval` allows `eval()` and `Function()` calls. `unsafe-inline` allows inline `<script>` tags.
- **Impact**: XSS attacks can execute arbitrary scripts if an injection vector is found.
- **Rationale check**: Next.js in dev mode requires `unsafe-eval`. However, this should be conditional on `NODE_ENV`. Stripe.js and PayPal may need `unsafe-inline` for their SDK scripts.
- **Fix**: Use nonce-based CSP for inline scripts. Remove `unsafe-eval` in production builds. If Stripe/PayPal require `unsafe-inline`, scope it more narrowly or use strict-dynamic.

#### [F-009] PayPal webhook amount fallback still fragile after audit fix — P2-MEDIUM
- **Domain**: Financial Logic
- **Location**: `services/payment-processor.ts:500-515`
- **Problem**: The audit fix added a DB lookup for the PayPal transaction amount, but the query uses the admin client's `supabase` variable which was created at the top of `handlePaypalWebhook()`. The fallback still does `CREDIT_PACKAGES.find(p => p.credits === credits)` and uses `pkg.price / 100`. If the transaction record wasn't updated with the actual amount yet, this path may produce a €0 invoice.
- **Impact**: Invoice with €0.00 amount for PayPal payments where the transaction amount column is null/0.
- **Fix**: If `paypalAmountGross` is 0 after both lookups, skip invoice generation and log a warning rather than creating a €0 invoice.

#### [F-010] Invoice `getInvoicePdf` ownership check uses admin client — defense in depth is weaker — P3-LOW
- **Domain**: Security
- **Location**: `services/invoice/invoice.db.service.ts:230-240`
- **Problem**: `getInvoicePdfWithNumber` uses the admin client (which bypasses RLS) and relies on an application-level `user_id` check. This is intentional (admin client is needed for the TEXT field retrieval), but the ownership check is a string comparison that could be bypassed if `invoiceId` is known and the caller doesn't pass the correct `userId`.
- **Impact**: Low — the download route properly authenticates the user and passes `user.id` from the session. The application-level check is correct. This is defense-in-depth observation only.
- **Fix**: No action required. The RLS policy `invoices_select_own` already restricts user-scoped queries, and the admin client usage is necessary for the binary data retrieval pattern.

#### [F-011] Stripe session amount uses `session.amount_total` — could be null — P2-MEDIUM
- **Domain**: Financial Logic
- **Location**: `services/payment-processor.ts:316`
- **Problem**: `const amountGross = (session.amount_total as number) / 100;` — `amount_total` from the Stripe webhook event object could be `null` for certain session types. Dividing `null / 100` produces `0` in JavaScript (coerced to `NaN / 100` → `NaN`... wait, `null / 100 = 0`). So the invoice would show €0.00.
- **Impact**: If Stripe sends a session with null `amount_total`, the invoice amount is €0.00. The credits are still correct (from metadata).
- **Fix**: Validate `session.amount_total` before using. Fallback to package price lookup if null:
```typescript
const amountGross = typeof session.amount_total === 'number' 
  ? session.amount_total / 100 
  : (CREDIT_PACKAGES.find(p => p.credits === credits)?.price ?? 0) / 100;
```

#### [F-012] Invoice DB service doesn't validate `amountGross > 0` — P2-MEDIUM
- **Domain**: Financial Logic
- **Location**: `services/invoice/invoice.db.service.ts:90-110` (`createInvoice`)
- **Problem**: The `createInvoice` method doesn't validate that `amountGross > 0`. The payment processor has a `if (params.amountGross > 0)` guard in `generateAndSendInvoice`, but the verify route doesn't have this guard.
- **Impact**: A €0.00 invoice could be generated and emailed, which would look unprofessional and confuse customers.
- **Fix**: Add at the top of `createInvoice`:
```typescript
if (data.amountGross <= 0) {
  throw new ValidationError('Invoice amount must be positive');
}
```

#### [F-013] Invoice number sequence doesn't reset per year — P3-LOW
- **Domain**: Data Integrity
- **Location**: `supabase/migrations/20260224210000_create_invoices_table.sql`
- **Problem**: The `invoice_number_seq` Postgres sequence is global. `generate_invoice_number()` prepends the year, but the sequence never resets. After RE-2026-00100, January 2027 starts at RE-2027-00101.
- **Impact**: Cosmetic only. Continuous numbering is legally valid in Germany. However, it may confuse accountants who expect year-based sequences.
- **Fix**: Accept as-is (already noted in audit) or implement a `year_counter` table approach.

#### [F-014] `48 uses of `: any` type` in production code — P3-LOW
- **Domain**: Code Quality
- **Location**: Various files (48 occurrences)
- **Problem**: Despite `strict: true` and `noImplicitAny: true` in tsconfig, there are 48 explicit `any` type annotations or `as any` casts.
- **Impact**: Type safety gaps. Some may hide real type mismatches.
- **Fix**: Audit each `any` usage. Replace with specific types or `unknown` where possible.

#### [F-015] CSP duplicated in `next.config.js` headers AND `middleware.ts` — P4-INFO
- **Domain**: Code Quality
- **Location**: `next.config.js:52`, `middleware.ts:25`
- **Problem**: The exact same CSP is defined in two places. Changes to one will be forgotten in the other.
- **Impact**: CSP drift between the two definitions. The middleware version wins for middleware-matched routes.
- **Fix**: Define CSP once in a shared constant, import in both places.

#### [F-016] `TASK-PDF-INVOICE.md` left in project root — P4-INFO
- **Domain**: Code Quality
- **Location**: `TASK-PDF-INVOICE.md`
- **Problem**: Development task spec file left in the repo. Contains implementation details and internal company info (tax numbers, etc.) that shouldn't be in the codebase.
- **Impact**: Information disclosure if repo goes public. Clutter.
- **Fix**: Delete the file.

#### [F-017] ~~Payment transaction missing `stripe_session_id`~~ — P4-INFO (VERIFIED OK)
- **Domain**: Financial Logic / Data Integrity
- **Location**: `app/api/payments/create-checkout/route.ts:158`
- **Problem**: Initially appeared that `stripe_session_id` wasn't stored on the transaction record.
- **Verification**: Confirmed that `create-checkout/route.ts:158` stores `stripe_session_id` at checkout creation time. The initial `processPayment` insert in `payment-processor.ts` creates a bare record, but the `create-checkout` route updates it with the session ID before the user is redirected. **Not a bug.**

#### [F-018] `createUserScopedClient` import removed from verify route but still needed for future — P4-INFO
- **Domain**: Code Quality
- **Location**: `app/api/payments/verify/route.ts:12`
- **Problem**: The import of `createUserScopedClient` was removed during audit fixes, but `createAdminClient` is imported from the same module. If someone later needs user-scoped queries in this file, they might re-add it without knowing about the RLS restriction.
- **Impact**: Informational — the admin client is correctly used.
- **Fix**: Add a comment noting that `payment_transactions` requires admin client due to service_role-only RLS.

#### [F-019] Rate limiter for invoice download uses generic 'api' tier — P3-LOW
- **Domain**: Security
- **Location**: `app/api/invoices/[id]/download/route.ts:22`
- **Problem**: `checkRateLimitAsync(rateLimitId, 'api')` uses the generic API rate limit tier. Invoice downloads are heavier (DB query for ~25KB TEXT blob) and should have a tighter limit than general API calls.
- **Impact**: A user could download the same invoice thousands of times within the API rate limit window, causing DB load.
- **Fix**: Use a dedicated `'download'` rate limit tier with lower limits, or cache the PDF response.

#### [F-020] Email service doesn't validate attachment size — P3-LOW
- **Domain**: Reliability
- **Location**: `services/email/email.service.ts`
- **Problem**: The `sendPaymentConfirmationEmail` accepts arbitrary PDF attachments without size validation. If a PDF is malformed or excessively large, Brevo may reject it.
- **Impact**: Email delivery failure. Non-fatal (error is caught), but customer won't receive their invoice.
- **Fix**: Add a max attachment size check (e.g., 5MB) before calling the Brevo API.

#### [F-021] Invoice verify route has duplicated email/invoice logic — DRY violation — P3-LOW
- **Domain**: Code Quality
- **Location**: `app/api/payments/verify/route.ts` (lines ~170-240 and ~255-310)
- **Problem**: The invoice generation + email sending logic is copy-pasted between the "already processed" path and the "first verification" path. Both blocks do: admin client query → email lookup → createInvoice → getInvoicePdf → sendPaymentConfirmationEmail.
- **Impact**: Any bug fix in one path must be replicated in the other. Maintenance burden.
- **Fix**: Extract a shared `generateInvoiceIfMissing(transactionId, userId, credits)` helper function.

#### [F-022] Blog content uses `dangerouslySetInnerHTML` — safe but worth noting — P4-INFO
- **Domain**: Security
- **Location**: `app/blog/[slug]/page.tsx:102`
- **Problem**: `<article dangerouslySetInnerHTML={{ __html: translation.content }} />` renders HTML from blog translation files.
- **Impact**: No risk currently — content is developer-controlled static translations, not user input. However, if a CMS is added later, this becomes an XSS vector.
- **Fix**: Document that blog content must be from trusted sources only. If CMS is added, sanitize with DOMPurify (already a dependency).

#### [F-023] `unsafe-eval` in CSP is required by Next.js dev mode but shipped to production — P1-HIGH
- **Domain**: Security
- **Location**: `next.config.js:52`, `middleware.ts:25`
- **Problem**: The CSP `script-src` includes `'unsafe-eval'` unconditionally. In development, Next.js requires this for hot module replacement. But the same CSP is used in production where `unsafe-eval` is unnecessary and dangerous.
- **Impact**: `unsafe-eval` in production allows `eval()`, `Function()`, and `setTimeout(string)` — significantly weakens XSS protection.
- **Fix**: Conditionally include `'unsafe-eval'` only in development:
```javascript
const scriptSrc = process.env.NODE_ENV === 'production'
  ? "script-src 'self' 'unsafe-inline' https://js.stripe.com ..."
  : "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com ...";
```

---

### Summary Table

| Domain | P0 | P1 | P2 | P3 | P4 | Total |
|--------|----|----|----|----|-----|-------|
| Security | 0 | 2 | 1 | 0 | 0 | 3 |
| Financial Logic | 1 | 1 | 4 | 0 | 0 | 6 |
| Data Integrity | 0 | 0 | 0 | 1 | 0 | 1 |
| Code Quality | 0 | 0 | 0 | 4 | 3 | 7 |
| Reliability | 0 | 0 | 1 | 1 | 0 | 2 |
| New Feature (Invoice) | 0 | 1 | 1 | 1 | 1 | 4 |
| **Total** | **1** | **4** | **7** | **7** | **4** | **23** |

---

### Positive Observations

1. **Excellent security posture overall** — HMAC-signed sessions, timing-safe comparisons, proper CORS, signature verification on both payment providers.
2. **Atomic financial operations** — All credit operations use Postgres RPC functions with proper `FOR UPDATE` locks and idempotency keys. No read-modify-write race conditions.
3. **Comprehensive RLS** — `FORCE ROW LEVEL SECURITY` on every table (except the new `invoices` table). Service-role-only policies ensure user-scoped clients can't access cross-tenant data.
4. **Decimal-safe monetary arithmetic** — Custom `monetary.ts` library using integer-cent arithmetic avoids IEEE 754 drift. Well-tested.
5. **XML security module** — Dedicated `xml-security.ts` with XXE prevention, namespace whitelisting, entity reference limits, and size limits.
6. **AI prompt injection defense** — Document content is sanitized (invisible chars stripped, injection patterns defanged) and wrapped in delimiter boundaries before AI prompts.
7. **File upload security** — Magic byte verification, MIME type whitelisting, file size limits at both client and server.
8. **GitHub Actions pinned to SHA** — Every action is pinned to a specific commit hash, preventing supply chain attacks.
9. **`npm ci` used in CI** — Reproducible builds with lockfile enforcement.
10. **Comprehensive accepted risk register** — 19 accepted risks documented with rationale, mitigations, and review dates. Professional risk management.
11. **Structured logging with PII redaction** — 30+ sensitive field names automatically redacted. Request correlation IDs throughout.
12. **TypeScript strictness** — `strict`, `noUncheckedIndexedAccess`, `noImplicitAny`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters` all enabled.
13. **Webhook signature verification** — Both Stripe (`constructEvent`) and PayPal (`verifyWebhookSignature`) properly verified before processing.
14. **Signed download URLs** — Download tokens use HMAC-SHA256 with resource-type/resource-id/user-id binding and expiry.
15. **Gitleaks in CI** — Secret scanning prevents accidental credential commits.

---

### Top 10 Priority Fixes

1. **[F-002] P0** — Deduplicate invoice email sending between webhook and verify paths. Customer may receive duplicate emails.
2. **[F-001] P1** — Add `FORCE ROW LEVEL SECURITY` to `invoices` table. One-line SQL fix, maintains consistency.
3. **[F-023] P1** — Remove `unsafe-eval` from production CSP. Significant XSS hardening.
4. **[F-017] P1** — Verify that `stripe_session_id` is back-filled on the transaction record. If not, the verify endpoint can't find transactions.
5. **[F-004] P2** — Use `monetary.ts` for invoice VAT calculations. Prevents floating-point drift in financial documents.
6. **[F-012] P2** — Add `amountGross > 0` validation in `createInvoice`. Prevents €0 invoices.
7. **[F-011] P2** — Validate `session.amount_total` is non-null before using. Prevents NaN/0 invoice amounts.
8. **[F-009] P2** — Skip invoice generation when PayPal amount resolves to €0.
9. **[F-008] P2** — Make CSP `unsafe-inline` conditional or use nonces.
10. **[F-016] P4** — Delete `TASK-PDF-INVOICE.md` (contains company tax numbers).
