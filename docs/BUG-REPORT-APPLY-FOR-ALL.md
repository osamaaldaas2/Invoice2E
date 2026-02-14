# Bug Report: "Apply for All" Feature
**Date**: 2026-02-13
**Component**: Batch Invoice Processing
**Files Analyzed**:
- `components/dashboard/ConversionHistory.tsx`
- `app/api/invoices/batch-apply/route.ts`
- `app/api/invoices/batch-validate/route.ts`

---

## CRITICAL BUGS 🔴

### BUG-1: Field Mismatch Between Frontend and Backend
**Severity**: CRITICAL
**Impact**: Users cannot apply all supported fields, feature incomplete

**Frontend** (`ConversionHistory.tsx:126-143`):
```typescript
const applyableFields = [
  'sellerName', 'sellerEmail', 'sellerPhone', 'sellerStreet', 'sellerCity',
  'sellerPostalCode', 'sellerCountryCode', 'sellerTaxId', 'sellerVatId',
  'sellerIban', 'sellerBic', 'buyerEmail', 'buyerCountryCode',
  'buyerReference', 'paymentTerms', 'currency'
]; // 16 fields
```

**Backend** (`batch-apply/route.ts:14-22`):
```typescript
const ALLOWED_FIELDS = new Set([
  'sellerName', 'sellerEmail', 'sellerPhone',
  'sellerAddress', 'sellerStreet', 'sellerCity', 'sellerPostalCode', 'sellerCountryCode',
  'sellerTaxId', 'sellerTaxNumber', 'sellerVatId', 'sellerIban', 'sellerBic',
  'sellerContactName',
  'buyerName', 'buyerEmail', 'buyerAddress', 'buyerStreet', 'buyerCity',
  'buyerPostalCode', 'buyerCountryCode', 'buyerTaxId', 'buyerReference',
  'paymentTerms', 'paymentInstructions', 'currency',
]); // 27 fields
```

**Missing in Frontend** (11 fields that backend accepts):
- `sellerAddress`
- `sellerContactName`
- `sellerTaxNumber`
- `buyerName` ⚠️ (commonly needed!)
- `buyerAddress`
- `buyerStreet`
- `buyerCity`
- `buyerPostalCode`
- `buyerTaxId`
- `paymentInstructions`

**Fix**: Add missing fields to frontend form OR remove from backend whitelist with documentation.

---

### BUG-2: Type Coercion Bug - Numeric Zero Not Updated
**Severity**: CRITICAL
**Impact**: Data corruption, fields with value `0` cannot be overwritten

**Location**: `batch-apply/route.ts:89`
```typescript
const current = String(data[key] || '').trim();
if (!current) {
  updates[key] = value;
}
```

**Problem**:
- If `data[key] = 0` (number zero), then:
  - `data[key] || ''` → `0` (not falsy in this context)
  - `String(0)` → `"0"`
  - `"0".trim()` → `"0"` (truthy!)
  - `if (!current)` → `false`, field NOT updated!

**Example Scenario**:
```javascript
// Invoice has incorrect data
data = { currency: 0 }

// User tries to apply correct currency
fields = { currency: "EUR" }

// Current logic:
String(0 || '') = String(0) = "0"
!"0" = false  // Does NOT update!

// Expected: Update to "EUR"
// Actual: Stays as 0 (corrupted!)
```

**Fix**:
```typescript
const current = data[key];
const isEmptyOrNull =
  current === null ||
  current === undefined ||
  (typeof current === 'string' && current.trim() === '');

if (isEmptyOrNull) {
  updates[key] = value;
}
```

---

### BUG-3: No Maximum Limit on Extraction IDs
**Severity**: HIGH (Security/DoS)
**Impact**: Server resource exhaustion, potential DoS attack

**Location**: `batch-apply/route.ts:46`
```typescript
if (!Array.isArray(extractionIds) || extractionIds.length === 0) {
  return NextResponse.json(
    { success: false, error: 'extractionIds array is required' },
    { status: 400 }
  );
}
```

**Problem**:
- No upper limit check!
- `batch-validate` route has `extractionIds.length > 500` check
- `batch-apply` has NO limit → user can send 10,000+ IDs

**Attack Scenario**:
```json
POST /api/invoices/batch-apply
{
  "extractionIds": ["id1", "id2", ..., "id10000"],
  "fields": { "sellerName": "X" }
}
```
→ Server loops through 10,000 DB updates → resource exhaustion

**Fix**:
```typescript
if (!Array.isArray(extractionIds) || extractionIds.length === 0 || extractionIds.length > 500) {
  return NextResponse.json(
    { success: false, error: 'extractionIds array required (1-500)' },
    { status: 400 }
  );
}
```

---

### BUG-4: No HTTP Status Check Before JSON Parse
**Severity**: HIGH
**Impact**: Unhandled errors, poor UX, silent failures

**Location**: `ConversionHistory.tsx:158-164`
```typescript
const res = await fetch('/api/invoices/batch-apply', { ... });
const data = await res.json();  // ❌ No res.ok check!
if (data.success) {
  // ...
}
```

**Problem**:
- If server returns 401 (Unauthorized), `res.json()` might fail
- If server returns 429 (Rate Limit), error message lost
- If server returns 500 (Internal Error), no proper handling

**Fix**:
```typescript
const res = await fetch('/api/invoices/batch-apply', { ... });

if (!res.ok) {
  const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
  setResult(`Error: ${errorData.error || res.statusText}`);
  return;
}

const data = await res.json();
if (data.success) {
  // ...
}
```

---

## HIGH PRIORITY BUGS 🟠

### BUG-5: Silent Error Handling - No Error Details
**Severity**: HIGH
**Impact**: User cannot diagnose why apply failed

**Location**: `ConversionHistory.tsx:165-166`
```typescript
} catch {
  setResult('Failed to apply fields');
}
```

**Problem**:
- Generic error message
- No stack trace, no details
- Could be network error, auth error, validation error → user has no clue

**Fix**:
```typescript
} catch (err) {
  const errorMsg = err instanceof Error ? err.message : 'Unknown error';
  setResult(`Failed to apply fields: ${errorMsg}`);
  console.error('Apply to All error:', err);
}
```

---

### BUG-6: No Transaction/Atomicity - Partial Updates
**Severity**: HIGH
**Impact**: Data inconsistency, no rollback on failure

**Location**: `batch-apply/route.ts:79-114`
```typescript
for (const extractionId of extractionIds) {
  try {
    // ... update extraction ...
    await invoiceDbService.updateExtraction(extractionId, ...);
    updatedCount++;
  } catch (err) {
    logger.warn('Failed to apply fields to extraction', { extractionId });
  }
}
```

**Problem**:
- Each update is a separate DB transaction
- If 5 out of 10 succeed, then server crashes → inconsistent state
- No rollback mechanism
- User doesn't know which invoices were updated vs which failed

**Scenarios**:
1. Update invoice 1-3 ✅
2. Update invoice 4 ❌ (DB error)
3. Update invoice 5-8 ✅
4. Server crashes → invoices 1-3, 5-8 updated, invoice 4 not updated
5. User retries → invoices 1-3, 5-8 skipped (already have values), invoice 4 updated
6. Final state OK but confusing UX

**Ideal Fix** (requires DB transaction support):
```typescript
// Use Supabase transaction
const { data, error } = await userClient.rpc('batch_update_extractions', {
  extraction_ids: extractionIds,
  updates: safeFields
});
```

**Pragmatic Fix** (collect failures, return detailed status):
```typescript
const results = { updated: [], skipped: [], failed: [] };

for (const extractionId of extractionIds) {
  try {
    // ... update logic ...
    if (Object.keys(updates).length === 0) {
      results.skipped.push(extractionId);
    } else {
      await invoiceDbService.updateExtraction(...);
      results.updated.push(extractionId);
    }
  } catch (err) {
    results.failed.push({ extractionId, error: err.message });
  }
}

return NextResponse.json({
  success: true,
  data: {
    updated: results.updated.length,
    skipped: results.skipped.length,
    failed: results.failed.length,
    failedDetails: results.failed, // NEW: Show which ones failed
  }
});
```

---

### BUG-7: Hardcoded Auto-Close Delay
**Severity**: MEDIUM
**Impact**: Poor UX, user might not see success message

**Location**: `ConversionHistory.tsx:161`
```typescript
setResult(`Updated ${data.data.updated} invoices (${data.data.skipped} already had values)`);
setTimeout(() => { onApplied(); }, 1500);  // ❌ Hardcoded 1.5s
```

**Problem**:
- User has only 1.5 seconds to read the message
- Panel closes automatically even if user wants to apply more fields
- No way to cancel or keep panel open

**Fix**: Remove auto-close, add manual "Done" button
```typescript
setResult(`✅ Updated ${data.data.updated} invoices (${data.data.skipped} already had values)`);
// Remove setTimeout, let user close manually or add explicit "Done" button
```

---

## MEDIUM PRIORITY BUGS 🟡

### BUG-8: Race Condition - Multiple Rapid Clicks
**Severity**: MEDIUM
**Impact**: Duplicate API calls if user clicks very fast

**Location**: `ConversionHistory.tsx:145-170`
```typescript
const handleApply = async () => {
  // ...
  setApplying(true);  // ⚠️ State update not immediate
  try {
    const res = await fetch(...);
    // ...
  } finally {
    setApplying(false);
  }
};
```

**Problem**:
- If user clicks twice in rapid succession (< 50ms), both clicks might trigger before `applying` state updates
- Two concurrent API calls sent
- Button disabled check (line 197) happens after state update propagates

**Fix**: Add ref-based guard
```typescript
const isApplyingRef = useRef(false);

const handleApply = async () => {
  if (isApplyingRef.current) return;  // Early guard

  isApplyingRef.current = true;
  setApplying(true);
  try {
    // ... fetch logic ...
  } finally {
    setApplying(false);
    isApplyingRef.current = false;
  }
};
```

---

### BUG-9: Validation Re-run Dependencies Missing
**Severity**: MEDIUM
**Impact**: Stale validation if extractionIds change

**Location**: `ConversionHistory.tsx:242-258`
```typescript
useEffect(() => {
  if (!isExpanded || extractionIds.length === 0 || validation) return;
  // ... validation fetch ...

  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [isExpanded]);  // ❌ Missing extractionIds dependency
```

**Problem**:
- ESLint warning suppressed
- If `extractionIds` changes (batch results updated), validation doesn't re-run
- Stale validation state shown to user

**Fix**: Add dependencies or explicitly document why they're omitted
```typescript
}, [isExpanded, extractionIds]);  // Add missing dependency
```

OR if intentional:
```typescript
}, [isExpanded]);
// Note: extractionIds omitted intentionally - validation is cleared and
// re-fetched manually in onApplied callback
```

---

### BUG-10: No Refresh After Individual Invoice Review
**Severity**: LOW
**Impact**: If user clicks "Review" on one invoice and fixes it, batch validation is not updated

**Location**: `ConversionHistory.tsx:460-467`
```typescript
<Link
  href={`/review/${result.extractionId}`}
  className="..."
>
  Review
</Link>
```

**Problem**:
- User clicks "Review", fixes invoice, saves
- Returns to batch view
- Validation state still shows old errors (not refreshed)
- Need to collapse/expand batch to trigger re-validation

**Fix**: Add event listener or callback to refresh validation when returning from review page
```typescript
// In parent component, detect navigation back
useEffect(() => {
  const handleFocus = () => {
    // Re-fetch history when user returns to page
    fetchHistory(page, statusFilter);
  };

  window.addEventListener('focus', handleFocus);
  return () => window.removeEventListener('focus', handleFocus);
}, [fetchHistory, page, statusFilter]);
```

---

## SUMMARY

**Critical Bugs**: 4
**High Priority**: 3
**Medium Priority**: 3
**Total**: 10 bugs

**Recommended Fix Priority**:
1. ✅ BUG-1: Add missing fields to frontend (quick fix, high impact)
2. ✅ BUG-2: Fix type coercion for numeric zero (data corruption risk)
3. ✅ BUG-3: Add max limit check (security issue)
4. ✅ BUG-4: Add HTTP status check (prevents silent failures)
5. ⏳ BUG-6: Return detailed failure info (UX improvement)
6. ⏳ BUG-5, BUG-7, BUG-8, BUG-9, BUG-10: Lower priority refinements

---

**Next Steps**:
1. Review and confirm bugs with team
2. Prioritize fixes (P0: BUG-1,2,3,4)
3. Write unit tests for edge cases
4. Implement fixes systematically
5. QA testing with real batch data
