# Invoice2E — Full Audit Report V4

**Date:** 2026-02-25  
**Scope:** Full codebase (381 source files, ~3100 total files)  
**Build:** `npm run build` ✅ exit code 0

---

## Summary

| Category         | Findings | Critical | High  | Medium | Low   |
| ---------------- | -------- | -------- | ----- | ------ | ----- |
| Security         | 5        | 0        | 1     | 2      | 2     |
| Type Safety      | 3        | 0        | 0     | 2      | 1     |
| Input Validation | 2        | 0        | 1     | 1      | 0     |
| Rate Limiting    | 1        | 0        | 0     | 1      | 0     |
| Error Handling   | 1        | 0        | 0     | 0      | 1     |
| SEO              | 0        | 0        | 0     | 0      | 0     |
| i18n             | 0        | 0        | 0     | 0      | 0     |
| Performance      | 1        | 0        | 0     | 0      | 1     |
| Dependencies     | 1        | 0        | 0     | 1      | 0     |
| Code Quality     | 3        | 0        | 0     | 1      | 2     |
| **TOTAL**        | **17**   | **0**    | **2** | **8**  | **7** |

---

## 🔴 HIGH Findings (2)

### H-001: Input validation missing on 12 POST/PATCH/PUT routes

**Files:** `auth/logout`, `files/upload`, `internal/batch-worker`, `invoices/batch-apply`, `invoices/batch-download`, `invoices/batch-format`, `invoices/batch-validate`, `invoices/templates`, `keys`, `payments/create-checkout`, `user/data-deletion`, `user/data-export`  
**Issue:** These routes accept POST/PATCH/PUT requests without Zod (or equivalent) input validation. While some may validate inside service functions, route-level validation is the first line of defense.  
**Risk:** Malformed payloads could cause unexpected behavior or errors.  
**Fix:** Add Zod schemas to validate request bodies at the route level.

### H-002: npm audit — 1 high severity vulnerability

**Package:** `minimatch` 9.0.0-9.0.5 (ReDoS via repeated wildcards)  
**Location:** `@sentry/node/node_modules/minimatch`, `glob/node_modules/minimatch`  
**Risk:** Denial of service via crafted glob patterns (server-side only).  
**Fix:** `npm audit fix` or update Sentry.

---

## 🟡 MEDIUM Findings (8)

### M-001: 40 remaining `: any` / `as any` type annotations

**Top files:** `route.ts` (13×), `analytics.service.ts` (9×), `useInvoiceReviewForm.ts` (4×), `facturx.generator.ts` (2×)  
**Issue:** Reduces type safety. Most are in API routes handling dynamic Supabase/external data.  
**Fix:** Replace with `unknown` + type narrowing, or add proper interfaces. Use `eslint-disable` only where truly unavoidable.

### M-002: 35 API routes without rate limiting

**Notable:** `auth/me`, `credits/history`, `credits/usage`, `invoices/analytics`, `invoices/batch-download`, `invoices/history`, `keys`, `payments/history`, `user/data-export`, `user/data-deletion`  
**Issue:** While admin routes are protected by auth, user-facing routes like `credits/history`, `invoices/history`, `keys`, and especially `user/data-export` and `user/data-deletion` should have rate limits.  
**Risk:** Abuse potential for authenticated users.  
**Fix:** Add `checkRateLimitAsync()` to at minimum: `data-export`, `data-deletion`, `keys`, `batch-download`.

### M-003: `console.error` in production component

**File:** `components/dashboard/ConversionHistory.tsx:196`  
**Issue:** Uses `console.error` instead of structured logger.  
**Fix:** Replace with `logger.error()`.

### M-004: Test file type errors (20+ errors in `api-keys.test.ts`)

**Issue:** Missing `@types/jest` or Vitest type configuration. `describe`, `it`, `expect` not recognized.  
**Fix:** Install `@types/jest` or add `/// <reference types="vitest" />` to test files.

### M-005: 12 POST routes without route-level input validation

(Overlaps with H-001 — listed separately as validation-specific finding)

### M-006: Format pages rendered dynamically (no static generation)

**Files:** All `app/pdf-to-*/page.tsx` pages  
**Issue:** Format landing pages are SSR (`ƒ Dynamic`) but contain no dynamic data — pure static content from i18n.  
**Fix:** Add `export const dynamic = 'force-static'` to format pages for better caching and faster TTFB.

### M-007: Large service files (>500 lines)

**Files:**

- `batch.service.ts` (841 lines)
- `blog/posts.ts` (789 lines)
- `ubl.service.ts` (785 lines)
- `user.admin.service.ts` (754 lines)
- `analytics.service.ts` (643 lines)
- `batch.processor.ts` (620 lines)
- `extract/route.ts` (614 lines)  
  **Fix:** Consider splitting into smaller modules for maintainability. Not urgent.

### M-008: Outdated dependencies with breaking changes available

**Notable:**

- `@supabase/supabase-js` 2.95 → 2.97 (minor, safe)
- `@sentry/nextjs` 10.39 → 10.40 (minor, fixes minimatch vuln?)
- `@hookform/resolvers` 3.10 → 5.2 (major, breaking)
- `@types/node` 20.x → 25.x (major)
- `vitest` 3.x → 4.x (major)  
  **Fix:** Update minor/patch: `npm update`. Major updates need testing.

---

## 🟢 LOW Findings (7)

### L-001: Hardcoded test secrets in test files

**Files:** `gdpr.test.ts`, `auth.integration.test.ts`  
**Issue:** Test secrets like `'test-secret-key-for-hmac-operations-32chars!'` and `'MyPassword456!'` in test files.  
**Risk:** None (test-only, not production secrets). Acceptable.

### L-002: 2 TODO comments in production code

**Count:** 2 occurrences  
**Fix:** Review and resolve or convert to GitHub issues.

### L-003: HTML response caching — `no-cache, no-store` on all pages

**Issue:** Dynamic SSR pages return `Cache-Control: private, no-cache, no-store` — even for public marketing pages.  
**Fix:** Static generation (M-006) would fix this automatically.

### L-004: 20 `.then()` chains without explicit `.catch()`

**Issue:** Most are fire-and-forget patterns (e.g., `fetch().then().catch(() => {})` where catch IS present but on a separate line). Some may genuinely lack error handling.  
**Risk:** Low — unhandled rejections in non-critical paths.

### L-005: RPC calls — potential SQL injection surface

**Count:** 10 `.rpc()` calls across services  
**Issue:** All use parameterized RPC calls via Supabase — no raw SQL concatenation found. **No actual vulnerability**, but the surface area should be monitored.

### L-006: `scripts/run-migrations.ts` uses `exec_sql` RPC

**Issue:** This script passes raw SQL strings to a `exec_sql` RPC function. Only used in development/migration scripts, not in production routes.  
**Risk:** None in production.

### L-007: 31 environment variables referenced

**Issue:** Large env surface. No `.env.example` file found to document required variables.  
**Fix:** Create `.env.example` with all required vars (empty values) for developer onboarding.

---

## ✅ Clean Areas (No Findings)

| Area                         | Status                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| **Secrets in code**          | ✅ No production secrets committed                                                 |
| **`.env` in `.gitignore`**   | ✅ Yes                                                                             |
| **Auth on protected routes** | ✅ All admin routes use `requireAdmin`, all user routes use `getAuthenticatedUser` |
| **Security headers**         | ✅ HSTS, CSP, X-Frame-Options DENY, nosniff, Referrer-Policy                       |
| **i18n completeness**        | ✅ 978 keys in both DE and EN — 0 missing                                          |
| **SEO meta tags**            | ✅ Unique title + description on all pages (fixed in this session)                 |
| **Sitemap**                  | ✅ 23 URLs including all format pages + /convert hub                               |
| **robots.txt**               | ✅ Allows format pages, blocks private routes (fixed in this session)              |
| **JSON-LD structured data**  | ✅ FAQPage + SoftwareApplication on all format pages                               |
| **ESLint**                   | ✅ 0 errors on new files                                                           |
| **Build**                    | ✅ Clean build, 0 TS errors in production code                                     |
| **GDPR pages**               | ✅ Privacy, Impressum, Terms — all present and complete                            |
| **Signup consent**           | ✅ Privacy checkbox required on signup                                             |

---

## Recommended Priority

1. **H-001** — Add Zod validation to critical POST routes (`data-deletion`, `data-export`, `create-checkout`, `batch-*`)
2. **M-002** — Add rate limiting to `data-export`, `data-deletion`, `keys`, `batch-download`
3. **H-002** — `npm audit fix` for minimatch
4. **M-006** — Static generation for format pages (quick SEO win)
5. **M-004** — Fix test types
6. **M-008** — Update minor dependencies (`npm update`)
7. Rest — Low priority, address as time permits

---

_Generated by MO ⚡ — Audit V4_
