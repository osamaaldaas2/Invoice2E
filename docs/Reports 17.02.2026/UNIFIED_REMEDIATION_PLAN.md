# UNIFIED REMEDIATION & STABILIZATION PLAN

**Invoice2E.1 — Multi-Format European e-Invoicing Platform**

| Field          | Value                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| Date           | 2026-02-17                                                                                                  |
| Author         | Lead Systems Architect (AI-embedded)                                                                        |
| Source Reports | CISO Security Audit, Regulatory Compliance Audit, SRE Reliability Audit, Post-Fix Multi-Format System Audit |
| Audited Commit | `8dcaddf` (branch: `main`)                                                                                  |
| Classification | CONFIDENTIAL                                                                                                |

---

## 1. EXECUTIVE SUMMARY

Four independent audits of Invoice2E.1 have been consolidated into this single remediation plan. The platform's original XRechnung functionality is solid, but the multi-format expansion (9 formats, commit `3e9b438`) introduced systemic gaps across validation, compliance, financial integrity, and observability.

**Verdict: CONDITIONAL NO-GO for multi-format production traffic.**

### By the Numbers

| Severity | Count | Source Findings (deduplicated)                                                                                           |
| -------- | ----- | ------------------------------------------------------------------------------------------------------------------------ |
| BLOCKER  | 7     | B-01, B-02, B-03, B-04, R-1/R-5, H-1, C-1                                                                                |
| CRITICAL | 7     | B-05, B-06, B-07, KSeF schema failures, credit notes blocked, Compliance §1.1, tax category masking                      |
| HIGH     | 10    | B-08/R-8, B-09, B-10, B-11, H-2, H-4, R-7, FatturaPA arithmetic, PEPPOL payment validation dead code, rate limiting gaps |
| MEDIUM   | 11    | B-12, B-13, R-2, R-6, R-9, M-1/M-2, M-5, M-6, payment means hardcoded, stale log messages, review payload duplication    |
| LOW      | 6     | L-1, L-2, L-3, R-10, R-11, R-12                                                                                          |

### Conditions for GO

1. All 7 Phase 0 blockers resolved
2. All Phase 1 critical compliance fixes deployed
3. Verification gates pass (tsc, vitest, build, lint)
4. FatturaPA and KSeF golden fixtures pass offline against official XSD schemas

### Strengths (Preserved)

The following controls are working correctly and must NOT be regressed:

- Authentication on all 30+ user-facing routes (RLS-enforced)
- HMAC-SHA256 session tokens with timing-safe comparison
- Atomic credit deduction via `safe_deduct_credits` PostgreSQL RPC
- Idempotent webhook processing via `verify_and_add_credits` UNIQUE constraint
- Optimistic batch job claiming via `WHERE status = 'pending'` with `RETURNING`
- XML injection prevention via `escapeXml()` covering all 5 special chars + control chars
- Bounded retry policies (max 3 batch + 2 validation = 5 AI calls per file)
- File upload validation (size limit, MIME type, magic bytes)
- Signed download tokens (userId+resourceId bound, 1-hour expiry)

---

## 2. CONSOLIDATED ISSUE MAP

### Deduplication Key

When multiple audits identified the same root cause, findings are merged under a single unified ID. The `Sources` column traces each unified issue back to its original report(s).

### 2.1 Financial Integrity Layer

| UID      | Severity    | Finding                                             | Root Cause                                                                                                                                                                                                                          | Sources      |
| -------- | ----------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **U-01** | **BLOCKER** | Credit double-deduction on stuck batch job recovery | `processBatch()` deducts credits upfront (line 352) with no idempotency check. When `recoverStuckJobs()` resets a partially-processed job to `pending`, the re-run deducts again for ALL files including already-processed ones.    | SRE R-1, R-5 |
| **U-02** | **BLOCKER** | Admin refund TOCTOU race condition                  | No lock between `paymentStatus !== 'completed'` check (line 175) and status update (line 287). Concurrent requests both read `completed`, both proceed. `deductCredits()` called twice with label-only reason — no idempotency key. | CISO H-1     |
| U-03     | MEDIUM      | Extraction credit refund lacks idempotency          | `addCredits()` at `extract/route.ts:259` has no `referenceId`. HTTP retry = double deduction + double refund = net credit loss.                                                                                                     | SRE R-6      |

### 2.2 Authoritative Invoice State & Format Context

| UID      | Severity    | Finding                                                            | Root Cause                                                                                                                                                                                                                                            | Sources                                 |
| -------- | ----------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **U-04** | **BLOCKER** | `outputFormat` lost on DB fallback — silently reverts to XRechnung | `outputFormat` stored in `conversions` table only, not in `extractionData`. DB fallback reads `extractionData` → `invoiceData.outputFormat` is `undefined` → defaults to `'xrechnung-cii'`. Five independent XRechnung fallback points compound this. | Post-Fix B-04, Compliance §1.1, SRE R-7 |
| U-05     | CRITICAL    | `validationWarnings` lost after review save                        | Warnings live in pre-review `extractionData`. After save, they end up inside `_originalExtraction` (stripped from API responses). `persistData` never receives them.                                                                                  | Post-Fix B-05, SRE R-4                  |
| U-06     | HIGH        | SessionStorage trusted over DB for conversion data                 | Convert page reads sessionStorage first. Stale/tampered data preferred over fresh DB. Two-tab race: different sessionStorage states → unpredictable conversion.                                                                                       | SRE R-7 (extended)                      |

### 2.3 Validation Pipeline Integrity

| UID      | Severity    | Finding                                                                         | Root Cause                                                                                                                                                                                                               | Sources         |
| -------- | ----------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| **U-07** | **BLOCKER** | `structuredErrors` access broken — convert returns empty `validationErrors: []` | `convert/route.ts:203` accesses `generationError.structuredErrors` directly, but `ValidationError` stores data in `.details.structuredErrors`. Cast produces `undefined`. ruleId logging (F-08) is also dead code.       | Post-Fix B-01   |
| **U-08** | **BLOCKER** | Factur-X validation rules are dead code                                         | `formatToProfileId()` maps both `'facturx-en16931'` and `'facturx-basic'` to `'en16931-base'`, which returns `[]`. `FacturXEN16931ProfileValidator` and `FacturXBasicProfileValidator` exist but are never instantiated. | Post-Fix B-02   |
| U-09     | CRITICAL    | No tax ID validation at review stage                                            | FatturaPA requires seller VAT ID (FPA-010), KSeF requires 10-digit NIP (KSEF-01), PEPPOL requires at least one tax ID (R004). None checked at review time. Invoices pass review → fail at convert with cryptic ruleIds.  | Post-Fix B-06   |
| U-10     | CRITICAL    | Credit notes blocked by review service                                          | `review.service.ts:107` rejects `totalAmount < 0`. Credit notes (documentTypeCode 381) legitimately have negative amounts. No form fields for `documentTypeCode` or `precedingInvoiceReference`.                         | Compliance §2.3 |
| U-11     | MEDIUM      | Zero-rate invoices skip tax validation entirely                                 | `itemsWithRates` filter requires `taxRate > 0`. Fallback requires `data.taxRate > 0`. Zero-rate invoices pass with any `taxAmount`.                                                                                      | Post-Fix B-12   |
| U-12     | MEDIUM      | Scaled tax tolerance too permissive for large invoices                          | `scaledTolerance = tol.TAX * itemsWithRates.length` → 100 items = €5.00 tolerance.                                                                                                                                       | Post-Fix B-13   |
| U-13     | MEDIUM      | Micro-invoice tolerance masks real errors                                       | For `subtotal = 1.00`, ±0.10 tolerance = ±10% error margin.                                                                                                                                                              | SRE R-2         |

### 2.4 Format-Specific Compliance

| UID  | Severity | Finding                                                     | Root Cause                                                                                                                                                                                                                                           | Sources                              |
| ---- | -------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| U-14 | CRITICAL | FatturaPA will be rejected by SDI                           | Namespace prefix broken (children unqualified while root uses `p:`), invalid CAP format for foreign addresses (`1015 AA` not 5 numeric digits), invalid CodiceFiscale format (German Steuernummer used), hardcoded RF01/MP01/N2.2/'0000000'/'N/A'/0. | Post-Fix B-07, Compliance §3.1, §5.3 |
| U-15 | CRITICAL | KSeF will fail XSD validation                               | Missing mandatory P_13/P_14 tax summary elements, missing Adnotacje section, no credit note support (KOREKTA), tax summary drops non-Polish rates creating arithmetic mismatch.                                                                      | Compliance §5.3, §4.5                |
| U-16 | CRITICAL | Tax category binary derivation masks 6 legal categories     | Binary: `rate > 0 → 'S'`, `rate = 0 → 'E'`. Cannot distinguish Z (zero-rated), AE (reverse charge), K (intra-community), G (export), O (not subject to VAT). Wrong Natura codes for FatturaPA, wrong P_12 for KSeF.                                  | Compliance §3.2                      |
| U-17 | HIGH     | Country code defaults to 'DE' for all non-XRechnung formats | Canonical mapper defaults seller/buyer countryCode to 'DE'. Wrong for IT (FatturaPA), PL (KSeF), NL (NLCIUS), RO (CIUS-RO).                                                                                                                          | Compliance §3.1                      |
| U-18 | HIGH     | Currency defaults to EUR for non-euro countries             | Canonical mapper defaults to 'EUR'. Wrong for PLN (KSeF), RON (CIUS-RO), GBP.                                                                                                                                                                        | Compliance §3.1                      |
| U-19 | HIGH     | PEPPOL payment means validation is dead code                | Full UNCL4461 code set defined in `peppol-rules.ts` but always checks `undefined` (field not in canonical model).                                                                                                                                    | Compliance §3.3                      |
| U-20 | HIGH     | VAT rate default 19% applied when rate missing              | XRechnung builder uses `DEFAULT_VAT_RATE = 19`. Wrong for PL (23%), IT (22%), NL (21%).                                                                                                                                                              | Compliance §3.1                      |
| U-21 | MEDIUM   | Payment means code entirely hardcoded                       | No user-facing or extraction-level mechanism. Binary IBAN present/absent switch. Cannot represent direct debit, card, PayPal.                                                                                                                        | Compliance §3.3                      |

### 2.5 XML Generation & Arithmetic Safety

| UID  | Severity | Finding                                                           | Root Cause                                                                                                                                                               | Sources                        |
| ---- | -------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| U-22 | HIGH     | FatturaPA/KSeF use raw floating-point for tax calculations        | FatturaPA: `totalPrice * (rate / 100)`. KSeF: `netAmount * 0.XX`. XRechnung uses integer-cent HALF_UP. Penny-rounding errors will fail SDI/KSeF arithmetic validation.   | Compliance §4.1                |
| U-23 | MEDIUM   | NLCIUS/CIUS-RO/Factur-X generators use fragile string replacement | PEPPOL, NLCIUS, CIUS-RO use `xml.replace(OLD_ID, NEW_ID)` to swap CustomizationID. Factur-X uses regex. If user data contains the ID string, corruption occurs silently. | CISO M-1, M-2, Compliance §1.2 |
| U-24 | MEDIUM   | Tax rounding adjustment via regex on built XML                    | CII builder line 739: `xml.replace(/<ram:CalculatedAmount>X</, ...)`. Fragile if amount appears multiple times.                                                          | Compliance §4.2                |
| U-25 | MEDIUM   | Duplicate gross-to-net preprocessing may double-convert           | Both `canonical-mapper.ts:preprocessGrossToNet` and `builder.ts:preprocessForNetPricing` run independently on the same data.                                             | Compliance §4.3                |
| U-26 | MEDIUM   | UBL monetary total inconsistency when allowances exist            | `LineExtensionAmount` from line items, `TaxExclusiveAmount` from `data.subtotal`. Allowances/charges create BR-CO-13 violation.                                          | Compliance §4.4                |
| U-27 | MEDIUM   | Unescaped parameter in Factur-X XMP metadata                      | `conformanceLevel` embedded raw. Currently hardcoded but pattern is unsafe.                                                                                              | CISO M-6                       |
| U-28 | LOW      | Post-generation validation uses `xml.includes()` string checks    | If element name appears in user data, validation gives false positive. Structurally broken XML may pass.                                                                 | CISO L-1, Compliance §5.2      |

### 2.6 Background Worker & Retry Safety

| UID      | Severity    | Finding                                                 | Root Cause                                                                                                                                                                         | Sources       |
| -------- | ----------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **U-29** | **BLOCKER** | Batch worker endpoint unauthenticated on non-production | When `BATCH_WORKER_SECRET` unset AND `NODE_ENV !== 'production'`, `isWorkerAuthorized()` returns `true` unconditionally. Vercel preview deploys default to `NODE_ENV=development`. | CISO C-1      |
| U-30     | HIGH        | AI prompt injection via PDF text in retry prompt        | `extraction-retry.ts:44` embeds raw `ctx.extractedText` (from PDF OCR) directly into retry prompt. No sanitization. Malicious PDF text could manipulate AI extraction results.     | CISO H-2      |
| U-31     | HIGH        | In-memory rate limiter bypassed in serverless           | Without Redis, each serverless instance has its own memory. 100 cold starts × 10 requests/min = 1000 extractions instead of 10. Production warning exists but doesn't enforce.     | CISO H-4      |
| U-32     | HIGH        | Missing rate limits on CPU-intensive endpoints          | `batch-download` (500 invoices/request) and `analytics`/`history` (CSV export) lack throttling.                                                                                    | CISO M-3, M-4 |
| U-33     | HIGH        | No virus/malware scanning on file upload                | Files go directly from `formData.get('file')` to AI extraction. No ClamAV or cloud scanning integration.                                                                           | CISO H-3      |
| U-34     | LOW         | Deprecated `createUserClient()` still exported          | Creates Supabase client WITHOUT user scoping. `console.warn` but still callable.                                                                                                   | CISO L-2      |
| U-35     | MEDIUM      | ~215MB peak memory per multi-invoice request            | 25MB PDF → split buffers + base64 encoding → potential OOM on concurrent requests.                                                                                                 | SRE R-10      |

### 2.7 Observability & Request Tracing

| UID  | Severity | Finding                                             | Root Cause                                                                                                                                                                          | Sources                |
| ---- | -------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| U-36 | HIGH     | `requestId` generated but never propagated to logs  | Middleware generates UUID, sets header. No API route calls `logContext.run()`. All log entries have `requestId: undefined`. Entire `AsyncLocalStorage` infrastructure is dead code. | Post-Fix B-08, SRE R-8 |
| U-37 | MEDIUM   | No `requestId` in error API responses               | Clients see `{ success: false, error: "..." }` only. Support cannot correlate user-reported errors to server logs.                                                                  | SRE R-9                |
| U-38 | MEDIUM   | Health endpoint exposes infrastructure topology     | AI provider config status, app version, uptime, DB/Redis connectivity visible on unauthenticated endpoint.                                                                          | CISO M-5               |
| U-39 | MEDIUM   | Stale XRechnung log messages in multi-format routes | Convert route logs `'Starting XRechnung conversion'`, `'Failed to generate XRechnung XML'` regardless of actual format.                                                             | Compliance §1.3        |
| U-40 | LOW      | Email logged on password reset (PII)                | `auth.service.ts:373` logs full email address. GDPR Article 5(1)(c) data minimization concern.                                                                                      | CISO L-3               |

### 2.8 UX & Review/Readiness Consistency

| UID      | Severity    | Finding                                       | Root Cause                                                                                                                                                                                                                             | Sources                        |
| -------- | ----------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **U-41** | **BLOCKER** | ReadinessPanel 100% XRechnung-hardcoded       | All 14 error-level checks are XRechnung-specific (IBAN, seller phone, payment terms). No `outputFormat` parameter. FatturaPA/KSeF users see "Not Ready" for valid invoices. XRechnung users see "Ready" despite missing seller tax ID. | Post-Fix B-03, Compliance §2.1 |
| U-42     | HIGH        | Country code dropdown limited to 8 countries  | Missing PL (KSeF), RO (CIUS-RO), and most EU member states. Polish/Romanian users cannot select their country.                                                                                                                         | Post-Fix B-10                  |
| U-43     | HIGH        | `paymentDueDate` field has no form input      | Field exists in form state and canonical mapper, but `PaymentSection` never renders an input. Users cannot add/edit due date. XRechnung BR-CO-25 requires payment terms or due date.                                                   | Post-Fix B-11                  |
| U-44     | HIGH        | Credit history shows raw/wrong source strings | `extraction:deduct` doesn't match any `SOURCE_KEYS` entry. `batch:refund:*` matches `startsWith('batch:')` before `includes('refund:')`, showing as "batchExtraction" not "refund".                                                    | Post-Fix B-09                  |
| U-45     | LOW         | Duplicate `items` array in review payload     | `useInvoiceReviewForm.ts:261` spreads `...data` (includes items) alongside explicit `lineItems` mapping. Both stored in DB JSONB.                                                                                                      | Post-Fix B-14                  |

---

## 3. SUBSYSTEM-BASED REMEDIATION PLAN

### Phase 0: Mandatory Blockers

**Gate:** Must be resolved before any multi-format production traffic.

---

#### 3.1 Financial Integrity Layer — Phase 0

##### U-01: Prevent credit double-deduction on batch job recovery

**Files:** `services/batch/batch.processor.ts:350-356`, `db/migrations/042_batch_credits_deducted.sql` (new)

**Change:**

1. Add `credits_deducted BOOLEAN DEFAULT FALSE` column to `batch_jobs` table
2. Before deducting in `processBatch()`, check the flag:

```typescript
const { data: jobRow } = await supabase
  .from('batch_jobs')
  .select('credits_deducted')
  .eq('id', jobId)
  .single();

if (!jobRow?.credits_deducted) {
  const deducted = await creditsDbService.deductCredits(
    userId,
    totalFiles,
    `batch:deduct:${jobId}`
  );
  if (deducted) {
    await supabase.from('batch_jobs').update({ credits_deducted: true }).eq('id', jobId);
  } else {
    /* insufficient credits handling */
  }
} // else: already deducted, skip
```

**Tests:** Add test for `processBatch` double-call with same `jobId` — second call must NOT deduct again.

##### U-02: Fix admin refund TOCTOU race condition

**Files:** `services/admin/transaction.admin.service.ts:163-360`

**Change:**

1. Replace two-step read→write with atomic status transition:

```sql
UPDATE payment_transactions
SET payment_status = 'refunding'
WHERE id = $1 AND payment_status = 'completed'
RETURNING *
```

2. If 0 rows returned → refund already in progress, return error
3. Pass `idempotency_key: transactionId` to Stripe refund API call
4. After Stripe succeeds: update to `'refunded'`; on Stripe failure: revert to `'completed'`

**Tests:** Add test simulating concurrent refund attempts — only one should succeed.

---

##### U-29: Remove batch worker dev fallback authentication bypass

**Files:** `app/api/internal/batch-worker/route.ts:15-33`

**Change:** Remove the `if (NODE_ENV !== 'production') return true` fallback. Always require `BATCH_WORKER_SECRET`. If unset, reject with 500.

```typescript
function isWorkerAuthorized(request: NextRequest): boolean {
  const secret = process.env.BATCH_WORKER_SECRET;
  if (!secret) {
    logger.error('BATCH_WORKER_SECRET is not configured');
    return false; // Always reject when unconfigured
  }
  const provided = request.headers.get('x-worker-secret');
  return provided === secret;
}
```

**Tests:** Add test for missing `BATCH_WORKER_SECRET` → returns 401.

---

#### 3.2 Validation Pipeline Integrity — Phase 0

##### U-07: Fix `structuredErrors` access in convert route

**Files:** `app/api/invoices/convert/route.ts:203`

**Change:** Replace:

```typescript
const structuredErrors = (generationError as ValidationError & { structuredErrors?: ... }).structuredErrors;
```

With:

```typescript
const structuredErrors = (generationError as ValidationError).details?.structuredErrors;
```

This also un-breaks the ruleId logging block on lines 205-214 and the `validationErrors` response on line 220.

**Tests:** Add test: throw `ValidationError` with `{ structuredErrors: [...] }` details → verify response body contains populated `validationErrors` array. Add test: verify ruleIds are logged.

##### U-08: Fix Factur-X profile mapping — restore dead validators

**Files:** `lib/format-utils.ts:10-11`

**Change:** Replace:

```typescript
case 'facturx-en16931':
case 'facturx-basic': return 'en16931-base';
```

With:

```typescript
case 'facturx-en16931': return 'facturx-en16931';
case 'facturx-basic': return 'facturx-basic';
```

This routes Factur-X formats to their actual validators (`FacturXEN16931ProfileValidator` and `FacturXBasicProfileValidator` in `ProfileValidatorFactory.ts`) which call `validateFacturXRules()`.

**Impact:** Factur-X invoices will now fail pre-validation if they lack required fields. Existing golden fixture tests may need updates.

**Tests:** Add test: `formatToProfileId('facturx-en16931')` === `'facturx-en16931'`. Add test: `formatToProfileId('facturx-basic')` === `'facturx-basic'`. Verify golden Factur-X fixtures still pass.

---

#### 3.3 Authoritative Invoice State — Phase 0

##### U-04: Persist `outputFormat` in extractionData during review save

**Files:** `app/api/invoices/review/route.ts:147-150`

**Change:** Add `outputFormat` to `persistData`:

```typescript
const persistData: Record<string, unknown> = {
  ...cleanedData,
  outputFormat, // ← ADD
  _originalExtraction: extractionData,
};
```

Also update the DB fallback in `app/convert/[extractionId]/page.tsx` to attempt fetching from the conversion record if `outputFormat` is missing from `extractionData`:

```typescript
// If extractionData lacks outputFormat, try conversion record
if (!extractionData.outputFormat) {
  const convRes = await fetch(`/api/invoices/conversions?extractionId=${extractionId}`);
  if (convRes.ok) {
    const convData = await convRes.json();
    if (convData.data?.outputFormat) {
      extractionData.outputFormat = convData.data.outputFormat;
    }
  }
}
```

**Tests:** Add test: review submit includes `outputFormat` in persisted data. Add test: DB fallback resolves correct format.

---

#### 3.4 UX & Review/Readiness — Phase 0

##### U-41: Make ReadinessPanel format-aware

**Files:** `components/forms/invoice-review/ReadinessPanel.tsx`

**Change:**

1. Add `outputFormat: OutputFormat` to `ReadinessPanelProps`
2. Define per-format check sets:
   - **XRechnung CII/UBL:** All current 14 checks
   - **PEPPOL BIS / NLCIUS / CIUS-RO:** Invoice#, date, seller/buyer name, seller/buyer country, line items, monetary, buyer reference
   - **FatturaPA:** Invoice#, date, seller/buyer name, seller VAT ID, line items, monetary
   - **KSeF:** Invoice#, date, seller/buyer name, seller NIP, line items, monetary
   - **Factur-X:** Invoice#, date, seller/buyer name, seller/buyer country, line items, monetary
3. Filter `checks` array based on `outputFormat`
4. Update `FormatSelector` / `InvoiceReviewForm` to pass `outputFormat` through

**Tests:** ReadinessPanel is a client component (no vitest tests currently). Add integration test or document manual test: select KSeF → verify only KSeF-relevant checks shown.

---

### Phase 1: Critical Compliance & Safety

**Gate:** Must be resolved before non-XRechnung formats are offered to users.

---

#### 3.5 Validation Pipeline Integrity — Phase 1

##### U-09: Add tax ID review validation per format

**Files:** `services/review.service.ts`

**Change:** After the XRechnung-specific block (line 104), add format-conditional tax ID checks:

```typescript
// Format-specific tax ID requirements
if (['fatturapa'].includes(outputFormat)) {
  if (!data.sellerVatId?.trim() && !data.sellerTaxId?.trim())
    throw new ValidationError('Seller VAT ID or Tax ID is required for FatturaPA');
}
if (['ksef'].includes(outputFormat)) {
  const nip = (data.sellerTaxId || data.sellerVatId || '').replace(/\D/g, '');
  if (nip.length !== 10) throw new ValidationError('Seller NIP (10-digit) is required for KSeF');
}
if (['peppol-bis', 'nlcius', 'cius-ro'].includes(outputFormat)) {
  if (!data.sellerVatId?.trim() && !data.sellerTaxId?.trim() && !data.sellerTaxNumber?.trim())
    throw new ValidationError('At least one seller tax identifier is required');
}
```

**Tests:** Add test per format: missing tax ID → validation error. Add test: XRechnung without tax ID → still passes (not required at review).

##### U-10: Allow credit notes through review validation

**Files:** `services/review.service.ts:106-109`

**Change:** Make negative amount check conditional on document type:

```typescript
const isCreditNote = data.documentTypeCode === '381' || data.documentTypeCode === 381;
if (!isCreditNote && (data.totalAmount < 0 || data.subtotal < 0 || data.taxAmount < 0)) {
  throw new ValidationError(
    'Amounts cannot be negative for invoices (use credit note for negative values)'
  );
}
```

**Impact:** Requires adding `documentTypeCode` to `ReviewedInvoiceData` type if not present.

**Tests:** Add test: credit note (381) with negative amounts → passes. Add test: invoice (380) with negative amounts → still blocked.

---

#### 3.6 Format-Specific Compliance — Phase 1

##### U-14: Fix FatturaPA SDI compliance

**Files:** `services/format/fatturapa/fatturapa.generator.ts`

**Sub-fixes:**

1. **Namespace:** Ensure all child elements use the `p:` prefix consistently, OR remove prefix from root and use default namespace
2. **CAP format:** Foreign addresses must use `'00000'` (5 numeric digits), not postal code with letters. Domestic Italian addresses must validate 5-digit CAP.
3. **CodiceFiscale:** Only emit `<CodiceFiscale>` when value matches Italian format (11 digits for company, 16 alphanumeric for person). Use `<IdCodice>` under `<IdFiscaleIVA>` for foreign tax IDs.
4. **Natura code:** When `taxCategoryCode` is available from extraction/review, map to correct Natura:
   - `E` → `N4` (exempt under art. 10)
   - `Z` → `N3.1` (non-taxable export to EU)
   - `AE` → `N6.7` (reverse charge)
   - `G` → `N3.2` (export outside EU)
   - `O` → `N2.2` (not subject, other cases) — current default, now explicit
5. **RegimeFiscale:** Accept from review form field `sellerTaxRegime` if available, default to `'RF01'`
6. **Use `computeTax()` from `monetary.ts`** instead of raw floating-point for tax calculations

**Tests:** Update golden `fatturapa.xml` fixture. Add test: foreign seller → `CAP = '00000'`. Add test: Italian seller → CAP validated as 5 digits.

##### U-15: Fix KSeF FA(2) schema compliance

**Files:** `services/format/ksef/ksef.generator.ts`

**Sub-fixes:**

1. **P_13/P_14 tax summary:** Generate `<P_13_1>` through `<P_13_11>` and matching `<P_14_1>` through `<P_14_11>` for standard Polish rates (23%, 22%, 8%, 7%, 5%, 0%). For non-Polish rates, map to nearest standard rate or reject with a clear error.
2. **Adnotacje section:** Add mandatory `<Adnotacje><P_16>2</P_16><P_17>2</P_17><P_18>2</P_18><P_18A>2</P_18A></Adnotacje>` section
3. **Credit notes:** Set `RodzajFaktury` to `'KOR'` when `documentTypeCode === '381'`. Add `<NrFaKorygowanej>` (preceding invoice reference).
4. **Use `computeTax()` from `monetary.ts`** instead of raw floating-point
5. **Non-Polish rates:** Explicitly reject rates not in the KSeF rate map rather than silently dropping them

**Tests:** Update golden `ksef.xml` fixture. Add test: mixed Polish rates → P_13/P_14 populated. Add test: credit note → RodzajFaktury = KOR.

##### U-16: Extend tax category derivation beyond binary S/E

**Files:** `types/canonical-invoice.ts` or wherever `TaxCategoryCode` is defined, `canonical-mapper.ts`, extraction prompt, review form

**Change:**

1. Add `taxCategoryCode` field to extraction prompt (instruct AI to extract: S, Z, E, AE, K, G, O)
2. Add `taxCategoryCode` dropdown to line item section in review form (expand existing dropdown to include O, L)
3. Map to Natura codes (FatturaPA), P_12 codes (KSeF), and `TaxCategory/ID` (UBL/CII) in canonical mapper
4. Fallback to current binary derivation ONLY when no explicit code is provided

**Tests:** Add test per tax category code: verify correct XML element in each format generator.

---

#### 3.7 Authoritative Invoice State — Phase 1

##### U-05: Preserve `validationWarnings` across review save

**Files:** `app/api/invoices/review/route.ts:147-150`

**Change:** Copy warnings from original extraction into persist data:

```typescript
const persistData: Record<string, unknown> = {
  ...cleanedData,
  outputFormat,
  validationWarnings: extractionData.validationWarnings || [], // ← ADD
  _originalExtraction: extractionData,
};
```

**Tests:** Add test: review save with warnings in original → warnings present in persisted data. Add test: page refresh → warnings still displayed.

---

### Phase 2: High-Priority Reliability & UX

---

#### 3.8 Observability & Request Tracing — Phase 2

##### U-36: Wire `requestId` propagation through API routes

**Files:** Create `lib/with-request-id.ts`, modify critical API routes

**Change:** Create a wrapper function:

```typescript
// lib/with-request-id.ts
import { logContext } from '@/lib/logger';
import { NextRequest } from 'next/server';

export function withRequestId<T>(request: NextRequest, fn: () => T | Promise<T>): T | Promise<T> {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  return logContext.run({ requestId }, () => fn());
}
```

Apply to: `convert/route.ts`, `review/route.ts`, `extract/route.ts`, `batch-worker/route.ts`

##### U-37: Include `requestId` in error API responses

**Files:** `lib/api-helpers.ts`

**Change:** Modify `handleApiError()` to include `requestId` from `logContext.getStore()`:

```typescript
const ctx = logContext.getStore();
return NextResponse.json(
  {
    success: false,
    error: message,
    ...(ctx?.requestId && { requestId: ctx.requestId }),
  },
  { status }
);
```

**Tests:** Add test: API error response includes `requestId` header value.

##### U-39: Fix stale XRechnung log messages

**Files:** `app/api/invoices/convert/route.ts`

**Change:** Replace hardcoded `'XRechnung'` strings in log messages with `resolvedFormat`:

- Line 85: `'Starting XRechnung conversion'` → `'Starting conversion'` with `{ format: resolvedFormat }`
- Line 239: `'Failed to generate XRechnung XML'` → `'Failed to generate XML'` with `{ format }`
- Line 309: `'XRechnung conversion completed successfully'` → `'Conversion completed'` with `{ format }`
- Line 116: `'XRechnung validation failed'` → `'Validation failed'` with `{ format }`

---

#### 3.9 UX & Review/Readiness — Phase 2

##### U-42: Expand country code list to all EU member states

**Files:** `components/forms/invoice-review/InvoiceReviewForm.tsx:23-32`

**Change:** Add all 27 EU countries plus common trading partners:
AT, BE, BG, CY, CZ, DE, DK, EE, EL/GR, ES, FI, FR, HR, HU, IE, IT, LT, LU, LV, MT, NL, PL, PT, RO, SE, SI, SK + CH, GB, NO

##### U-43: Add `paymentDueDate` input to PaymentSection

**Files:** `components/forms/invoice-review/PaymentSection.tsx`

**Change:** Add `<input type="date" {...register('paymentDueDate')} />` alongside existing payment terms field.

##### U-44: Fix credit history source key mapping

**Files:** `components/dashboard/CreditHistory.tsx`

**Change:**

1. Add to `SOURCE_KEYS`: `'extraction:deduct'`, `'extraction:deduct:multi'`, `'extraction:refund'`, `'extraction:refund:multi'`
2. Reorder fallback chain: check `includes('refund')` BEFORE `startsWith('batch:')`

**Tests:** Add unit test: `getSourceDisplay('batch:refund:abc')` returns refund label, not batchExtraction.

---

#### 3.10 Background Worker & Retry Safety — Phase 2

##### U-30: Sanitize retry prompt inputs

**Files:** `lib/extraction-retry.ts:20-52`

**Change:** Before embedding `ctx.extractedText` in the retry prompt:

1. Truncate to reasonable length (e.g., 10,000 chars)
2. Strip lines matching common injection patterns (e.g., lines starting with "ignore", "forget", "system:", "assistant:")
3. Wrap extracted text in explicit delimiters with instructions to treat as data only

##### U-31 + U-32: Enforce Redis rate limiting in production; add missing rate limits

**Files:** `lib/rate-limiter.ts`, `app/api/invoices/batch-download/route.ts`, `app/api/invoices/analytics/route.ts`, `app/api/invoices/history/route.ts`

**Change:**

1. In `rate-limiter.ts`: if `UPSTASH_REDIS_REST_URL` is unset in production, throw instead of falling back to in-memory
2. Add `checkRateLimitAsync(rateLimitId, 'bulk')` to batch-download (5 req/min)
3. Add `checkRateLimitAsync(rateLimitId, 'api')` to analytics and history routes

---

#### 3.11 Format-Specific Compliance — Phase 2

##### U-17 + U-18: Format-aware country and currency defaults

**Files:** `services/canonical-mapper.ts`

**Change:** When `outputFormat` is known, set defaults based on format:

```typescript
const FORMAT_DEFAULTS: Record<OutputFormat, { country: string; currency: string }> = {
  fatturapa: { country: 'IT', currency: 'EUR' },
  ksef: { country: 'PL', currency: 'PLN' },
  nlcius: { country: 'NL', currency: 'EUR' },
  'cius-ro': { country: 'RO', currency: 'RON' },
  'xrechnung-cii': { country: 'DE', currency: 'EUR' },
  'xrechnung-ubl': { country: 'DE', currency: 'EUR' },
  'peppol-bis': { country: 'DE', currency: 'EUR' },
  'facturx-en16931': { country: 'FR', currency: 'EUR' },
  'facturx-basic': { country: 'FR', currency: 'EUR' },
};
```

Use as fallback only when extracted/reviewed data is missing.

##### U-20: Remove hardcoded DEFAULT_VAT_RATE=19

**Files:** `services/format/xrechnung/builder.ts`, `services/format/xrechnung/ubl.service.ts`

**Change:** When `taxRate` is missing from a line item, derive from document-level `taxRate` if available. If no rate available at all, emit a validation error instead of silently defaulting to 19%.

---

### Phase 3: Medium-Priority Quality

---

#### 3.12 Validation Pipeline — Phase 3

##### U-11: Handle zero-rate invoices in extraction validator

**Files:** `lib/extraction-validator.ts:92-94`

**Change:** Include items with `taxRate === 0` in the per-line-item tax check:

```typescript
const itemsWithRates = data.lineItems.filter(
  (li) => typeof li.taxRate === 'number' && li.taxRate >= 0 // was > 0
);
```

Also add a dedicated check: if all rates are 0 but `taxAmount > 0`, flag as error.

##### U-12: Cap scaled tax tolerance

**Files:** `lib/extraction-validator.ts:103`

**Change:**

```typescript
const scaledTolerance = Math.min(tol.TAX * Math.max(1, itemsWithRates.length), 1.0);
```

Cap at €1.00 maximum regardless of line item count.

##### U-13: Scale tolerance relative to invoice total

**Files:** `lib/extraction-validator.ts`

**Change:** For micro-invoices, use relative tolerance: `Math.max(absoluteTolerance, subtotal * 0.01)` — 1% relative minimum.

---

#### 3.13 Financial Integrity — Phase 3

##### U-03: Add idempotency to extraction credit refunds

**Files:** `app/api/invoices/extract/route.ts:259`

**Change:** Pass a deterministic reference ID:

```typescript
await creditsDbService.addCredits(
  userId,
  failCount,
  'extraction:refund:multi',
  `extract-refund:${extractionId}`
);
```

Also add a UNIQUE constraint check on the reference in `addCredits()`.

---

#### 3.14 Format-Specific Compliance — Phase 3

##### U-21: Add payment means code to canonical model

**Files:** `types/canonical-invoice.ts`, review form, canonical mapper

**Change:**

1. Add `paymentMeansCode?: string` to `PaymentInfo` interface
2. Add dropdown to review form: 10 (cash), 30 (credit transfer), 48 (card), 49 (direct debit), 58 (SEPA)
3. Map to format-specific codes in generators (MP01-MP23 for FatturaPA, 1-6 for KSeF)

---

#### 3.15 XML Generation & Arithmetic — Phase 3

##### U-27: Escape XMP metadata parameter

**Files:** `services/format/facturx/facturx.generator.ts:395`

**Change:** `escapeXml(conformanceLevel)` — one-line defensive fix.

##### U-26: Fix UBL monetary total consistency with allowances

**Files:** `services/format/xrechnung/ubl.service.ts`

**Change:** Compute `TaxExclusiveAmount` as `LineExtensionAmount - AllowanceTotalAmount + ChargeTotalAmount` instead of using `data.subtotal` directly.

---

#### 3.16 Observability — Phase 3

##### U-38: Restrict health endpoint information

**Files:** `app/api/health/route.ts`

**Change:** Return only `{ status: "ok" | "degraded" }` for unauthenticated requests. Move detailed diagnostics behind admin authentication.

---

#### 3.17 UX — Phase 3

##### U-45: Remove duplicate items array from review payload

**Files:** `components/forms/invoice-review/useInvoiceReviewForm.ts:261`

**Change:**

```typescript
const { items: _items, ...rest } = data;
const payload = { ...rest, lineItems: data.items.map(...) };
```

---

### Phase 4: Low-Priority Improvements

| UID  | Fix                                                                      | Files                                        | Effort |
| ---- | ------------------------------------------------------------------------ | -------------------------------------------- | ------ |
| U-28 | Replace `xml.includes()` validation with XML parser                      | All generators                               | 8h     |
| U-23 | Replace string-based CustomizationID swapping with parametric generation | PEPPOL, NLCIUS, CIUS-RO, Factur-X generators | 12h    |
| U-24 | Replace regex-based tax rounding adjustment                              | `builder.ts:739`                             | 2h     |
| U-25 | Deduplicate gross-to-net preprocessing                                   | `canonical-mapper.ts`, `builder.ts`          | 4h     |
| U-34 | Remove deprecated `createUserClient()`                                   | `lib/supabase.server.ts`                     | 1h     |
| U-40 | Mask email in password reset logs                                        | `services/auth.service.ts:373`               | 1h     |
| U-33 | Integrate virus scanning (ClamAV or cloud)                               | Upload pipeline                              | 8h     |
| U-35 | Add memory budgeting for PDF splitting                                   | `services/pdf-splitter.service.ts`           | 4h     |

### Phase 5: Long-Term Architecture

| Initiative                   | Description                                                                                    | Effort |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | ------ |
| XML DOM library              | Replace all string concatenation with `xmlbuilder2` or similar                                 | 40h    |
| XSD/Schematron integration   | Add official validator binaries (KoSIT, SDI) as build-time golden test                         | 20h    |
| Structured metrics           | Per-provider extraction rate, retry rate, format rejection rate, credit balance reconciliation | 16h    |
| Optimistic locking           | Add version column to `invoice_extractions`, check in review PATCH                             | 8h     |
| Formal credit reconciliation | Periodic job comparing expected vs actual credit balances                                      | 8h     |

---

## 4. FILE-LEVEL IMPACT MATRIX

Files listed by modification count across all phases. Higher counts indicate higher-risk files requiring careful review.

| File                                                      | Phase 0    | Phase 1    | Phase 2    | Phase 3          | Total Touches |
| --------------------------------------------------------- | ---------- | ---------- | ---------- | ---------------- | ------------- |
| `services/review.service.ts`                              | —          | U-09, U-10 | —          | —                | 2             |
| `app/api/invoices/convert/route.ts`                       | U-07       | —          | U-36, U-39 | —                | 3             |
| `app/api/invoices/review/route.ts`                        | U-04, U-05 | —          | —          | —                | 2             |
| `lib/format-utils.ts`                                     | U-08       | —          | —          | —                | 1             |
| `services/batch/batch.processor.ts`                       | U-01       | —          | —          | —                | 1             |
| `app/api/internal/batch-worker/route.ts`                  | U-29       | —          | —          | —                | 1             |
| `services/admin/transaction.admin.service.ts`             | U-02       | —          | —          | —                | 1             |
| `app/convert/[extractionId]/page.tsx`                     | U-04       | —          | —          | —                | 1             |
| `components/forms/invoice-review/ReadinessPanel.tsx`      | U-41       | —          | —          | —                | 1             |
| `services/format/fatturapa/fatturapa.generator.ts`        | —          | U-14       | —          | —                | 1             |
| `services/format/ksef/ksef.generator.ts`                  | —          | U-15       | —          | —                | 1             |
| `services/canonical-mapper.ts`                            | —          | U-16       | U-17, U-18 | —                | 3             |
| `lib/extraction-validator.ts`                             | —          | —          | —          | U-11, U-12, U-13 | 3             |
| `lib/logger.ts`                                           | —          | —          | U-36       | —                | 1             |
| `lib/with-request-id.ts` (NEW)                            | —          | —          | U-36       | —                | 1             |
| `lib/rate-limiter.ts`                                     | —          | —          | U-31       | —                | 1             |
| `lib/extraction-retry.ts`                                 | —          | —          | U-30       | —                | 1             |
| `components/forms/invoice-review/InvoiceReviewForm.tsx`   | —          | —          | U-42       | —                | 1             |
| `components/forms/invoice-review/PaymentSection.tsx`      | —          | —          | U-43       | —                | 1             |
| `components/dashboard/CreditHistory.tsx`                  | —          | —          | U-44       | —                | 1             |
| `components/forms/invoice-review/useInvoiceReviewForm.ts` | —          | —          | —          | U-45             | 1             |
| `app/api/health/route.ts`                                 | —          | —          | —          | U-38             | 1             |
| `services/format/facturx/facturx.generator.ts`            | —          | —          | —          | U-27             | 1             |
| `types/canonical-invoice.ts`                              | —          | U-16       | U-21       | —                | 2             |

---

## 5. DB MIGRATION REQUIREMENTS

| Migration                            | Phase | SQL                                                                                                                | Reversible?                                                  |
| ------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `042_batch_credits_deducted.sql`     | 0     | `ALTER TABLE batch_jobs ADD COLUMN credits_deducted BOOLEAN DEFAULT FALSE;`                                        | Yes — `ALTER TABLE batch_jobs DROP COLUMN credits_deducted;` |
| (Implicit) Atomic refund transition  | 0     | Application-level — use `UPDATE ... WHERE payment_status = 'completed' RETURNING *` pattern. No DDL.               | N/A                                                          |
| (Optional) Credit refund idempotency | 3     | `CREATE UNIQUE INDEX idx_audit_logs_credit_ref ON audit_logs (changes->>'reason') WHERE action = 'credits_added';` | Yes — `DROP INDEX`                                           |

**Note:** Migration `041_expand_conversion_format_check.sql` (already created) expands the `conversion_format` CHECK constraint for 9 formats. This must be applied before any new format conversions.

---

## 6. TEST ADDITIONS REQUIRED

### Phase 0 Tests

| Test                             | File                                       | Type        | What It Verifies                                                                            |
| -------------------------------- | ------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------- |
| Double-deduction prevention      | `tests/unit/batch/batch.processor.test.ts` | Unit        | `processBatch()` called twice with same jobId → credits deducted only once                  |
| Worker auth without secret       | `tests/unit/api/batch-worker.test.ts`      | Unit        | Missing `BATCH_WORKER_SECRET` → 401 regardless of `NODE_ENV`                                |
| Structured error propagation     | `tests/unit/api/convert.route.test.ts`     | Unit        | `ValidationError` with `.details.structuredErrors` → response body contains populated array |
| ruleId logging fires             | `tests/unit/api/convert.route.test.ts`     | Unit        | Structured errors with ruleIds → `logger.warn` called with ruleIds                          |
| Factur-X profile mapping         | `tests/unit/lib/format-utils.test.ts`      | Unit        | `formatToProfileId('facturx-en16931')` → `'facturx-en16931'`                                |
| outputFormat persisted in review | `tests/unit/api/review.route.test.ts`      | Unit        | Review submit → extractionData includes `outputFormat` field                                |
| ReadinessPanel KSeF checks       | Manual                                     | Integration | Select KSeF → verify only KSeF-relevant checks shown                                        |
| ReadinessPanel FatturaPA checks  | Manual                                     | Integration | Select FatturaPA → verify only FatturaPA-relevant checks shown                              |

### Phase 1 Tests

| Test                         | File                                | Type   | What It Verifies                                             |
| ---------------------------- | ----------------------------------- | ------ | ------------------------------------------------------------ |
| FatturaPA tax ID required    | `tests/unit/review.service.test.ts` | Unit   | FatturaPA format + missing VAT ID → throws                   |
| KSeF NIP required            | `tests/unit/review.service.test.ts` | Unit   | KSeF format + invalid NIP → throws                           |
| Credit note negative amounts | `tests/unit/review.service.test.ts` | Unit   | documentTypeCode=381 + negative total → passes               |
| FatturaPA golden fixture     | `tests/unit/fatturapa.test.ts`      | Golden | Updated fixture passes xml.includes checks + valid namespace |
| KSeF golden fixture          | `tests/unit/ksef.test.ts`           | Golden | Updated fixture has P_13/P_14/Adnotacje                      |
| KSeF credit note             | `tests/unit/ksef.test.ts`           | Unit   | documentTypeCode=381 → RodzajFaktury=KOR                     |

### Phase 2 Tests

| Test                          | File                                          | Type | What It Verifies                                |
| ----------------------------- | --------------------------------------------- | ---- | ----------------------------------------------- |
| requestId in logs             | `tests/unit/lib/with-request-id.test.ts`      | Unit | Wrapped handler → log entries include requestId |
| requestId in error response   | `tests/unit/lib/api-helpers.test.ts`          | Unit | Error response JSON includes requestId          |
| Credit history source display | `tests/unit/components/CreditHistory.test.ts` | Unit | New reason strings → correct labels             |
| Rate limit enforcement (prod) | `tests/unit/lib/rate-limiter.test.ts`         | Unit | Missing Redis URL in production → throws        |

### Phase 3 Tests

| Test                                  | File                                          | Type | What It Verifies                          |
| ------------------------------------- | --------------------------------------------- | ---- | ----------------------------------------- |
| Zero-rate tax validation              | `tests/unit/lib/extraction-validator.test.ts` | Unit | All items taxRate=0 + taxAmount>0 → error |
| Capped tolerance                      | `tests/unit/lib/extraction-validator.test.ts` | Unit | 100 items → tolerance capped at 1.0       |
| Relative tolerance for micro-invoices | `tests/unit/lib/extraction-validator.test.ts` | Unit | subtotal=1.00 → tolerance at least 0.01   |

---

## 7. ROLLOUT STRATEGY

### Deployment Sequence

```
Phase 0 (Week 1)
├── Day 1: U-29 (batch worker auth) — HOTFIX, deploy immediately
├── Day 1: U-02 (refund race) — HOTFIX, deploy immediately
├── Day 2: U-01 (credit double-deduction) — requires migration 042
├── Day 2: U-07 (structuredErrors fix) — deploy with convert route
├── Day 2: U-08 (Factur-X mapping) — deploy with format-utils
├── Day 3: U-04 (outputFormat persistence) — deploy with review route
├── Day 3: U-41 (ReadinessPanel) — deploy with UI bundle
└── Day 3: Run full verification gates

Phase 1 (Week 2)
├── Day 1: U-09, U-10 (review validation) — deploy with review service
├── Day 2-3: U-14 (FatturaPA fixes) — deploy with generator + golden fixtures
├── Day 3-4: U-15 (KSeF fixes) — deploy with generator + golden fixtures
├── Day 4: U-16 (tax category) — deploy with canonical mapper + extraction prompt
├── Day 5: U-05 (warnings persistence) — deploy with review route
└── Day 5: Run full verification gates + offline XSD validation

Phase 2 (Week 3)
├── U-36, U-37 (requestId) — deploy with wrapper + routes
├── U-42, U-43, U-44 (UX fixes) — deploy with UI bundle
├── U-30 (prompt sanitization) — deploy with extraction-retry
├── U-31, U-32 (rate limiting) — deploy with rate-limiter
├── U-17, U-18, U-20 (format defaults) — deploy with canonical mapper
└── Run full verification gates

Phase 3 (Week 4)
├── U-11, U-12, U-13 (extraction validator) — deploy with validator
├── U-03 (credit refund idempotency) — deploy with extract route
├── U-21, U-26, U-27 (format & arithmetic) — deploy with generators
├── U-38, U-39 (observability) — deploy with routes
└── Run full verification gates
```

### Feature Flag Strategy

No feature flags needed — all changes are backward-compatible corrections:

- Phase 0 fixes correct broken behavior (empty error arrays, dead validators, wrong panel checks)
- Phase 1 adds validation that previously didn't exist (tighter is safe)
- Phase 2/3 are defensive improvements

### Rollback Plan

Each phase has an independent rollback path:

- **Phase 0:** Revert commits. Migration 042 is additive (new column) — safe to leave in place.
- **Phase 1:** Revert commits. Generator changes may require golden fixture rollback.
- **Phase 2/3:** Revert commits. No schema changes.

---

## 8. PRODUCTION GO / NO-GO CRITERIA

### Phase 0 Gate (Minimum Viable Multi-Format)

| Criterion             | Verification Method | Required Result                                                    |
| --------------------- | ------------------- | ------------------------------------------------------------------ |
| `npx tsc --noEmit`    | CI                  | 0 errors                                                           |
| `npx vitest run`      | CI                  | All tests pass                                                     |
| `npm run build`       | CI                  | Exit code 0                                                        |
| `npm run lint`        | CI                  | 0 errors                                                           |
| B-01 regression test  | Unit test           | `validationErrors` populated in convert response                   |
| B-02 regression test  | Unit test           | `formatToProfileId('facturx-en16931')` returns `'facturx-en16931'` |
| B-03 manual test      | Manual              | KSeF format → panel shows only KSeF-relevant checks                |
| B-04 regression test  | Unit test           | Review persist includes `outputFormat`                             |
| Credit deduction test | Unit test           | Double-call protection verified                                    |
| Worker auth test      | Unit test           | No-secret → 401 in development                                     |

### Phase 1 Gate (Format Compliance)

| Criterion                | Verification Method                   | Required Result                        |
| ------------------------ | ------------------------------------- | -------------------------------------- |
| All Phase 0 criteria     | CI                                    | Still passing                          |
| FatturaPA golden fixture | Offline XSD validation (SDI schema)   | Passes namespace + element checks      |
| KSeF golden fixture      | Offline XSD validation (FA(2) schema) | Has P_13/P_14, Adnotacje               |
| Tax ID review validation | Unit tests                            | Per-format tax ID enforcement          |
| Credit note flow         | Unit test                             | Negative amounts accepted for type 381 |

### Full Production GO

All Phase 0 + Phase 1 gates pass. Phase 2+ may proceed incrementally without blocking production.

---

## 9. RESIDUAL RISK AFTER PHASE COMPLETION

### After Phase 0+1

| Risk                                        | Severity                | Mitigation Path                                                                           | Timeline  |
| ------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- | --------- |
| Prompt injection via PDF text (U-30)        | HIGH                    | Phase 2 fix. Current mitigation: bounded retries (max 2), AI model resilience.            | Week 3    |
| In-memory rate limiter bypass (U-31)        | HIGH                    | Phase 2 fix. Current mitigation: Redis configured in production (check env).              | Week 3    |
| No virus scanning (U-33)                    | HIGH                    | Phase 4. Current mitigation: files never stored long-term, only processed by AI.          | Month 2   |
| SessionStorage trust (U-06)                 | HIGH                    | Partially mitigated by U-04 (format persisted). Full fix (DB-first) deferred.             | Week 3    |
| String-based XML generation                 | MEDIUM                  | Phase 5 architectural change. Current mitigation: `escapeXml()` + post-generation checks. | Quarter 2 |
| No XSD/Schematron validation                | MEDIUM                  | Phase 5. Current mitigation: business rule validators catch ~80% of issues.               | Quarter 2 |
| Payment means code hardcoded (U-21)         | MEDIUM                  | Phase 3. Current mitigation: IBAN-based binary switch works for ~90% of cases.            | Week 4    |
| Floating-point arithmetic in FatturaPA/KSeF | LOW (after Phase 1 fix) | Generators will use `computeTax()`. Residual: edge cases with very large invoices.        | —         |

### After Phase 2+3

| Risk                                      | Severity | Mitigation Path                                                                        | Timeline  |
| ----------------------------------------- | -------- | -------------------------------------------------------------------------------------- | --------- |
| No virus scanning (U-33)                  | HIGH     | Phase 4. Consider cloud-based scanning (AWS Macie, Google DLP) for faster integration. | Month 2   |
| String-based XML generation               | MEDIUM   | Phase 5. Accept risk for current release; plan migration for next major version.       | Quarter 2 |
| No optimistic locking on concurrent edits | MEDIUM   | Phase 5. Current mitigation: single-user workflow makes races unlikely.                | Quarter 2 |
| Deprecated `createUserClient()`           | LOW      | Phase 4 removal. Current mitigation: console.warn discourages use.                     | Month 2   |
| PDF encryption bypass                     | LOW      | Phase 4. Intentional for extraction; document as known behavior.                       | Month 2   |

### Accepted Risks (Will Not Fix)

| Risk                                                                     | Reason                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| String-based retry error classification (`errorMessage.includes('429')`) | Bounded impact (3 extra retries max), very low probability of false match |
| `ignoreEncryption: true` in PDF loading                                  | Intentional — required for invoice extraction from encrypted PDFs         |
| `LEITWEG-ID` placeholder for buyer reference                             | User responsibility — cannot generate valid Leitweg-IDs programmatically  |
| Unit code default `C62`                                                  | Acceptable industry default for "each/unit"                               |

---

## APPENDIX A: CROSS-REFERENCE TABLE

Maps every original finding ID back to its unified ID in this plan.

| Original ID      | Report     | Unified ID                           | Phase              |
| ---------------- | ---------- | ------------------------------------ | ------------------ |
| C-1              | CISO       | U-29                                 | 0                  |
| H-1              | CISO       | U-02                                 | 0                  |
| H-2              | CISO       | U-30                                 | 2                  |
| H-3              | CISO       | U-33                                 | 4                  |
| H-4              | CISO       | U-31                                 | 2                  |
| M-1              | CISO       | U-23                                 | 4                  |
| M-2              | CISO       | U-23                                 | 4                  |
| M-3              | CISO       | U-32                                 | 2                  |
| M-4              | CISO       | U-32                                 | 2                  |
| M-5              | CISO       | U-38                                 | 3                  |
| M-6              | CISO       | U-27                                 | 3                  |
| L-1              | CISO       | U-28                                 | 4                  |
| L-2              | CISO       | U-34                                 | 4                  |
| L-3              | CISO       | U-40                                 | 4                  |
| B-01             | Post-Fix   | U-07                                 | 0                  |
| B-02             | Post-Fix   | U-08                                 | 0                  |
| B-03             | Post-Fix   | U-41                                 | 0                  |
| B-04             | Post-Fix   | U-04                                 | 0                  |
| B-05             | Post-Fix   | U-05                                 | 1                  |
| B-06             | Post-Fix   | U-09                                 | 1                  |
| B-07             | Post-Fix   | U-14                                 | 1                  |
| B-08             | Post-Fix   | U-36                                 | 2                  |
| B-09             | Post-Fix   | U-44                                 | 2                  |
| B-10             | Post-Fix   | U-42                                 | 2                  |
| B-11             | Post-Fix   | U-43                                 | 2                  |
| B-12             | Post-Fix   | U-11                                 | 3                  |
| B-13             | Post-Fix   | U-12                                 | 3                  |
| B-14             | Post-Fix   | U-45                                 | 3                  |
| §1.1             | Compliance | U-04                                 | 0                  |
| §1.2             | Compliance | U-23                                 | 4                  |
| §1.3             | Compliance | U-39                                 | 2                  |
| §2.1             | Compliance | U-41                                 | 0                  |
| §2.3             | Compliance | U-10                                 | 1                  |
| §3.1 (FatturaPA) | Compliance | U-14                                 | 1                  |
| §3.1 (defaults)  | Compliance | U-17, U-18, U-20                     | 2                  |
| §3.2             | Compliance | U-16                                 | 1                  |
| §3.3             | Compliance | U-21                                 | 3                  |
| §4.1             | Compliance | U-22                                 | 1 (via U-14, U-15) |
| §4.2             | Compliance | U-24                                 | 4                  |
| §4.3             | Compliance | U-25                                 | 4                  |
| §4.4             | Compliance | U-26                                 | 3                  |
| §4.5             | Compliance | U-15                                 | 1                  |
| §5.2             | Compliance | U-28                                 | 4                  |
| §5.3 (FatturaPA) | Compliance | U-14                                 | 1                  |
| §5.3 (KSeF)      | Compliance | U-15                                 | 1                  |
| R-1              | SRE        | U-01                                 | 0                  |
| R-2              | SRE        | U-13                                 | 3                  |
| R-3              | SRE        | _Already fixed_ (Stage 1 multi-rate) | —                  |
| R-4              | SRE        | U-05                                 | 1                  |
| R-5              | SRE        | U-01                                 | 0                  |
| R-6              | SRE        | U-03                                 | 3                  |
| R-7              | SRE        | U-04, U-06                           | 0, 2               |
| R-8              | SRE        | U-36                                 | 2                  |
| R-9              | SRE        | U-37                                 | 2                  |
| R-10             | SRE        | U-35                                 | 4                  |
| R-11             | SRE        | _Accepted risk_                      | —                  |
| R-12             | SRE        | _Accepted risk_                      | —                  |

---

_End of Unified Remediation & Stabilization Plan_
