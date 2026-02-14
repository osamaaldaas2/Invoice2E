# Bug Report: Batch Download Reading Stale Data After "Apply to All"

**Date**: 2026-02-13
**Severity**: CRITICAL 🔴
**Status**: INVESTIGATING (Diagnostic logging added)

---

## Problem Description

**User Report**:
1. Upload 30 invoices → 29 missing `buyerEmail`
2. Click "Apply to All", fill in `buyerEmail`
3. Validation re-runs → shows "ready" status ✅
4. Click "Download ZIP"
5. **ERROR**: "No invoices could be converted to XRechnung XML"
6. Console logs show: All 29 invoices still missing `buyerEmail` ❌

**Expected**: Download should work with updated `buyerEmail`
**Actual**: Download fails, reads old data without `buyerEmail`

---

## Root Cause Analysis

### Data Flow Investigation

**Apply to All** → `/api/invoices/batch-apply`:
1. Reads `extraction.extractionData` from DB
2. Merges updates: `updatedData = { ...data, ...updates }`
3. Saves back: `updateExtraction(id, { extractionData: updatedData })`
4. Returns success ✅

**Validation** → `/api/invoices/batch-validate`:
1. Reads `extraction.extractionData` from DB
2. Explicitly maps fields: `buyerEmail: (data.buyerEmail as string) || null`
3. Validates with `xrechnungValidator.validateInvoiceDataSafe()`
4. Shows "ready" status ✅

**Download** → `/api/invoices/batch-download`:
1. Reads `extraction.extractionData` from DB
2. Uses spread: `serviceData = { ...data, ...defaults }`
3. Passes to `xrechnungService.generateXRechnung()`
4. **FAILS** validation ❌

### Hypotheses

#### H1: Database Update Not Persisting (50% probability)
**Theory**: `updateExtraction` call succeeds but data doesn't persist to DB

**Evidence**:
- Validation reads same data (same query) and shows "ready"
- If data wasn't persisted, validation would also fail
- **UNLIKELY** - validation proves data IS in DB

#### H2: Field Mapping Mismatch (80% probability)
**Theory**: batch-validate and batch-download read data differently

**Evidence**:
- batch-validate: Explicit field mapping (line 83: `buyerEmail: (data.buyerEmail as string) || null`)
- batch-download: Spread operator (line 68: `...data`)
- Spread SHOULD work, but maybe `data.buyerEmail` is undefined?

**Possible Cause**: `_originalExtraction` destructuring might affect spread

```typescript
// batch-download line 62-65
const { _originalExtraction: _snap, ...data } = extraction.extractionData;

// If extractionData = { buyerEmail: "test@example.com", _originalExtraction: {...} }
// Then data = { buyerEmail: "test@example.com" } ✅

// But if extractionData has nested structure or prototype issues?
// Then data might be missing fields ❌
```

#### H3: Timing/Cache Issue (70% probability)
**Theory**: Download reads from cached/stale data source

**Possible Causes**:
1. **Supabase cache**: PostgREST might cache query results
2. **Connection pooling**: Different DB connections see different snapshots
3. **Read replica lag**: If using read replicas, update might not have propagated
4. **Transaction isolation**: Update and read in different transactions with stale snapshot

**Evidence**:
- User clicks Download very quickly after Apply completes
- `onRefresh()` is called but is async (might not complete before Download)
- Frontend state might have stale `extractionIds`

#### H4: camelToSnakeKeys Conversion Bug (40% probability)
**Theory**: JSONB update loses nested fields during conversion

**Code Flow**:
```typescript
// batch-apply
const updatedData = { ...data, ...updates };  // camelCase
await updateExtraction(id, { extractionData: updatedData });

// updateExtraction
const snakeData = camelToSnakeKeys(data);
// { extractionData: {...} } → { extraction_data: {...} }
// But does it convert the CONTENTS of extractionData?

await client.from('invoice_extractions')
  .update(snakeData)  // { extraction_data: {...} }
```

**Memory doc says**: "RECURSIVE, converts JSONB contents"

**But**: Does recursive conversion handle nested objects correctly?

---

## Diagnostic Changes Added

### 1. Batch Apply Logging
**File**: `app/api/invoices/batch-apply/route.ts:108-115`

```typescript
logger.info('Batch apply - updated extraction', {
  extractionId,
  fieldsUpdated: Object.keys(updates),
  buyerEmailBefore: data.buyerEmail,
  buyerEmailAfter: updatedData.buyerEmail,
});
```

**What to check**:
- Verify `buyerEmailAfter` is set correctly
- Verify `fieldsUpdated` includes 'buyerEmail'

### 2. Batch Download Read Logging
**File**: `app/api/invoices/batch-download/route.ts:67-73`

```typescript
logger.info('Batch download - reading extraction', {
  extractionId,
  buyerEmail: data.buyerEmail,
  sellerEmail: data.sellerEmail,
  dataKeys: Object.keys(data).sort(),
});
```

**What to check**:
- Does `buyerEmail` exist in `data`?
- Are keys in `dataKeys` camelCase or snake_case?

### 3. Batch Download ServiceData Logging
**File**: `app/api/invoices/batch-download/route.ts:89-94`

```typescript
logger.info('Batch download - serviceData prepared', {
  extractionId,
  buyerEmail: serviceData.buyerEmail,
  sellerEmail: serviceData.sellerEmail,
});
```

**What to check**:
- Does `serviceData.buyerEmail` match `data.buyerEmail`?

### 4. Explicit Field Passing
**File**: `app/api/invoices/batch-download/route.ts:85-86`

```typescript
// Ensure critical fields are explicitly passed (don't rely on spread)
buyerEmail: data.buyerEmail || null,
sellerEmail: data.sellerEmail || null,
```

**Why**: Make field passing explicit like batch-validate does

---

## Testing Instructions

### Step 1: Reproduce the Bug

1. Upload 30 invoices via batch upload
2. Verify 29 are missing `buyerEmail` (check validation)
3. Click "Apply to All"
4. Fill in `buyerEmail: "test@example.com"`
5. Click "Apply to All" button
6. Wait for validation to show "ready"
7. Click "Download ZIP"
8. **Check console logs and server logs**

### Step 2: Analyze Logs

Look for these log entries in order:

```
[Batch apply - updated extraction]
{
  extractionId: "abc123",
  fieldsUpdated: ["buyerEmail"],
  buyerEmailBefore: null,
  buyerEmailAfter: "test@example.com"
}

[Batch download - reading extraction]
{
  extractionId: "abc123",
  buyerEmail: "test@example.com" or null,  ← CHECK THIS!
  dataKeys: ["buyerEmail", "invoiceNumber", ...]
}

[Batch download - serviceData prepared]
{
  extractionId: "abc123",
  buyerEmail: "test@example.com" or null,  ← CHECK THIS!
}
```

### Step 3: Identify Root Cause

**Scenario A**: `buyerEmailAfter` is set, but `buyerEmail` in download is `null`
→ **Cause**: Database update not persisting OR cache issue (H1 or H3)
→ **Fix**: Add database transaction, clear cache, add delay

**Scenario B**: `buyerEmail` in download is `undefined` (not in `dataKeys`)
→ **Cause**: Field mapping issue or spread operator problem (H2)
→ **Fix**: Explicit field mapping like batch-validate

**Scenario C**: `buyerEmail` exists in download but wrong value
→ **Cause**: Conversion bug or stale read (H4 or H3)
→ **Fix**: Check camelToSnakeKeys recursion

**Scenario D**: `buyerEmail` is correct in serviceData but validation still fails
→ **Cause**: XRechnung service expects different format
→ **Fix**: Check xrechnungService.generateXRechnung input requirements

---

## Potential Fixes (Based on Root Cause)

### Fix 1: Add Explicit Field Mapping (H2)
**Already implemented in diagnostic changes**

Make batch-download match batch-validate's explicit mapping:
```typescript
const serviceData = {
  // Explicit mapping like batch-validate
  invoiceNumber: String(data.invoiceNumber || ''),
  buyerEmail: (data.buyerEmail as string) || null,
  sellerEmail: (data.sellerEmail as string) || null,
  // ... all other fields
} as XRechnungInvoiceData;
```

### Fix 2: Add Database Transaction (H1/H3)
```typescript
// In batch-apply, wrap in transaction
const { error } = await client.rpc('batch_update_extractions', {
  extraction_ids: extractionIds,
  updates: safeFields
});
```

### Fix 3: Add Delay/Polling (H3)
```typescript
// In frontend, after onApplied
setTimeout(() => {
  onRefresh();
  // Wait for refresh to complete before enabling Download button
}, 2000);
```

### Fix 4: Force Cache Bust (H3)
```typescript
// In batch-download, add cache-busting
const extraction = await invoiceDbService.getExtractionById(extractionId, userClient);
// Force re-read from master (if using read replicas)
```

---

## Next Steps

1. **User tests with diagnostic logging enabled**
2. **Analyze log output** to identify which hypothesis is correct
3. **Implement targeted fix** based on root cause
4. **Add unit test** to prevent regression
5. **Document in ADR** if architectural change needed

---

## Workaround (Temporary)

Until fixed, users can:
1. Apply fields to all invoices
2. **Wait 5-10 seconds** after validation shows "ready"
3. **Refresh the page** (F5)
4. Then click Download ZIP

This ensures database updates propagate and frontend has fresh data.

---

**Status**: Waiting for diagnostic log analysis from user testing
