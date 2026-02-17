# Fix Plan V2 — Post-Audit Implementation Plan

**Date:** 2026-02-13
**Scope:** Fresh comprehensive scan after all Phase 1-4 fixes from the original discovery

---

## Audit Summary

**Database Security:** ✅ Clean (0 Supabase security advisor issues)
**RLS Policies:** ✅ All 16 public tables have proper RLS enabled with correct policies
**Functions:** ✅ All SECURITY DEFINER functions have search_path set (either `'public'` or `''` with fully-qualified table names)
**Data Integrity:** ⚠️ 3 minor data issues remaining
**Code Quality:** ⚠️ 11 code-level issues found

---

## Phase 1 — High Priority (Code Safety)

### 1.1 Fix Stripe credits parseInt without NaN guard
- **Severity:** HIGH
- **File:** `app/api/payments/verify/route.ts` line 78
- **Problem:** `parseInt(session.metadata.credits, 10)` — if metadata.credits is non-numeric, credits becomes NaN, which flows downstream into credit operations
- **Fix:** Add `Number.isFinite()` guard after parseInt, throw ValidationError if NaN

### 1.2 Fix buildSellerLegalOrganization empty sellerName edge case
- **Severity:** HIGH
- **File:** `services/xrechnung/builder.ts` lines 277-280
- **Problem:** If `sellerName` is empty/undefined and no VAT ID or tax number exists, produces `<ram:TradingBusinessName></ram:TradingBusinessName>` (empty element = invalid XML)
- **Fix:** Add `sellerName?.trim()` guard, log error and return empty string if no identifier available

### 1.3 Add early startup validation for SUPABASE_JWT_SECRET
- **Severity:** HIGH
- **File:** `lib/supabase.server.ts`
- **Problem:** Missing JWT secret only detected on first user request, not at startup. App starts fine but all user-scoped routes fail
- **Fix:** Add `if (process.env.NODE_ENV === 'production' && !process.env.SUPABASE_JWT_SECRET)` check at module load

### 1.4 Fix credit race condition in multi-extraction refund
- **Severity:** MEDIUM
- **File:** `app/api/invoices/extract/route.ts` (refund logic)
- **Problem:** If credit refund fails after extraction, user loses credits with no record
- **Fix:** Wrap refund in try/catch with CRITICAL-level error log for manual recovery

---

## Phase 2 — Medium Priority (Consistency & Validation)

### 2.1 Add rate limiting to templates GET endpoint
- **File:** `app/api/invoices/templates/route.ts` line 18-41
- **Problem:** POST has rate limiting, GET does not — inconsistent and could be abused
- **Fix:** Add `checkRateLimitAsync()` after auth check in GET handler

### 2.2 Standardize API response envelope
- **Files:** `app/api/invoices/templates/route.ts` (GET returns `{ templates }`, POST returns `{ template }`)
- **Problem:** Most routes use `{ success, data: { ... } }` but templates uses `{ success, templates }`
- **Fix:** Wrap in `data:` for consistency

### 2.3 Add voucher code max length validation
- **File:** `app/api/vouchers/redeem/route.ts` line 10
- **Problem:** `z.string().min(3)` has no max — could accept extremely long strings
- **Fix:** Add `.max(100)` to Zod schema

### 2.4 Fix KoSIT validator paths for portability
- **File:** `.env.local` lines 35-37
- **Problem:** Hardcoded Windows absolute paths (`C:/Users/osama/Desktop/...`) — breaks on Linux/Vercel
- **Fix:** Change to relative paths from project root (`./vendor/...`)

---

## Phase 3 — Low Priority (Cleanup)

### 3.1 Clean remaining 3 extraction_data `items` keys
- **Migration:** `039_cleanup_remaining_items_keys.sql`
- **Problem:** 3 records still have duplicate `items` alongside `line_items` (migration 035 ran but these were added after)
- **Fix:** `UPDATE invoice_extractions SET extraction_data = extraction_data - 'items' WHERE extraction_data ? 'items' AND extraction_data ? 'line_items'`

### 3.2 Delete `nul` file from project root
- **Problem:** 0-byte `nul` file (Windows NUL device artifact) still in project root
- **Fix:** `rm nul` (already in .gitignore)

### 3.3 Improve session renewal error logging
- **File:** `lib/session.ts` lines 209-226
- **Problem:** Session renewal catches errors silently without logging
- **Fix:** Add `logger.warn()` in catch block

---

## Execution Order

1. Phase 1 (1.1 → 1.4) — Code fixes, apply immediately
2. Phase 2 (2.1 → 2.4) — Consistency fixes
3. Phase 3 (3.1 → 3.3) — Cleanup

## What's Clean (No Action Needed)

- ✅ All RLS policies properly configured on all 16 tables
- ✅ All SECURITY DEFINER functions secure
- ✅ Supabase security advisor: 0 issues
- ✅ All API routes have authentication
- ✅ .env.local properly gitignored
- ✅ Session tokens use timing-safe comparison
- ✅ PayPal credits properly validated with `Number.isFinite()`
- ✅ CORS middleware functioning correctly
- ✅ No orphan records in database
- ✅ No stuck processing jobs or extractions
