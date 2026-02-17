# Multi-Format Batch Assignment — Staged Retrofit Plan

## Problem Statement

The batch upload pipeline is hardcoded to XRechnung:
1. `batch-validate/route.ts` uses `xrechnungValidator` (not the format-aware validation pipeline)
2. `batch-download/route.ts` uses `xrechnungService.generateXRechnung()` (not `GeneratorFactory`)
3. `BulkUploadForm.tsx` readiness checks are hardcoded to XRechnung fields (IBAN, email, etc.)
4. No per-invoice format assignment exists in the batch list view
5. `invoice_extractions` table has no `output_format` column — format lives only in `batch_jobs` (per-batch) or `invoice_conversions` (created late)
6. Refresh/new tab loses any format choice because it was only in sessionStorage

### Root Cause

One architectural gap: **per-extraction `output_format` is not stored in the DB** at extraction time. Everything downstream inherits a batch-level default or falls back to `'xrechnung-cii'`. This cascades into:
- XRechnung-only validation in batch-validate
- XRechnung-only generation in batch-download
- XRechnung-only readiness checks in the UI

**Fix**: Add `output_format` to `invoice_extractions`, expose an API for bulk assignment, then retrofit all consumers to be format-aware.

---

## Stage 0: Database Migration + Format Assignment API

### Goals
- Add authoritative `output_format` column to `invoice_extractions`
- Create `POST /api/invoices/batch-format` for bulk format assignment
- Backfill existing extractions from conversion records where available

### Files Impacted

| File | Change |
|------|--------|
| `supabase/migrations/20260217_extraction_output_format.sql` | **NEW** — add column + backfill |
| `app/api/invoices/batch-format/route.ts` | **NEW** — bulk format assignment endpoint |
| `services/invoice.db.service.ts` | Add `updateExtractionFormat()` method |
| `types/index.ts` | Add `outputFormat` to `InvoiceExtraction` type |

### DB Migration

```sql
ALTER TABLE invoice_extractions
  ADD COLUMN IF NOT EXISTS output_format VARCHAR(50);

-- Backfill from conversions where available
UPDATE invoice_extractions e
SET output_format = c.output_format
FROM invoice_conversions c
WHERE c.extraction_id = e.id
  AND c.output_format IS NOT NULL
  AND e.output_format IS NULL;

-- Index for filtering by format
CREATE INDEX IF NOT EXISTS idx_extractions_output_format
  ON invoice_extractions(output_format) WHERE output_format IS NOT NULL;
```

### API: `POST /api/invoices/batch-format`

```
Request:  { extractionIds: string[], outputFormat: OutputFormat }
Response: { success: true, data: { updated: number } }
```

- Validates `outputFormat` against known formats
- Updates `invoice_extractions.output_format` for all provided IDs
- RLS-scoped (user can only update own extractions)

### Verification Gate
- `npx tsc --noEmit`
- Migration applies cleanly

---

## Stage 1: Format-Aware Batch Validation

### Goals
- Refactor `batch-validate` to accept per-extraction outputFormat
- Use `validateForProfile()` (the canonical pipeline) instead of `xrechnungValidator`
- Map extraction data to `CanonicalInvoice` via `toCanonicalInvoice()`

### Files Impacted

| File | Change |
|------|--------|
| `app/api/invoices/batch-validate/route.ts` | Refactor: read `output_format` from DB, use `validateForProfile()` |
| `services/format/canonical-mapper.ts` | May need minor fixes for batch data shape |

### Key Changes

1. Read `output_format` from `invoice_extractions` table (DB-authoritative)
2. If not set, use `detectFormatFromData()` as fallback
3. Map to `CanonicalInvoice` via `toCanonicalInvoice(data, outputFormat)`
4. Call `validateForProfile(canonical, formatToProfileId(outputFormat))`
5. Return per-extraction: `{ errors, warnings, missingFields, valid, outputFormat }`

### What Changes for the User
- Selecting KSeF will NOT require IBAN/email/phone
- Selecting XRechnung WILL require XRechnung-only fields
- Selecting Peppol triggers Peppol-specific ID checks
- Each extraction's validation result matches its assigned format

### Verification Gate
- `npx tsc --noEmit`
- `npx vitest run` — existing tests pass
- Manual: validate extraction with different formats, verify different error sets

---

## Stage 2: Format-Aware Batch Download

### Goals
- Refactor `batch-download` to use `GeneratorFactory` instead of `xrechnungService`
- Read per-extraction `output_format` from DB
- Refuse download if blocking validation errors exist for the selected format

### Files Impacted

| File | Change |
|------|--------|
| `app/api/invoices/batch-download/route.ts` | Major refactor: use GeneratorFactory, read output_format per extraction |

### Key Changes

1. For each extraction, read `output_format` from DB (fall back to `detectFormatFromData()`)
2. Map data to `CanonicalInvoice` via `toCanonicalInvoice(data, outputFormat)`
3. Pre-validate via `validateForProfile(canonical, formatToProfileId(outputFormat))`
4. Generate via `GeneratorFactory.create(outputFormat).generate(canonical)`
5. Handle mixed formats in one ZIP (different file extensions, PDF for Factur-X)
6. Update conversion record with correct format

### Verification Gate
- `npx tsc --noEmit`
- `npx vitest run`
- Manual: download batch with mixed formats

---

## Stage 3: Batch View List UI — Multi-Select + Format Assignment

### Goals
- Add multi-select checkboxes to BulkUploadForm invoice list
- Add format dropdown + Apply button + Unselect All
- Persist format assignment via `POST /api/invoices/batch-format`
- Re-run format-aware validation after assignment
- Update readiness checks to use format-aware logic

### Files Impacted

| File | Change |
|------|--------|
| `components/forms/BulkUploadForm.tsx` | Major: add multi-select, format dropdown, format-aware readiness |
| `lib/format-registry.ts` | Read-only (used for dropdown options) |
| `lib/format-field-config.ts` | Read-only (used for format-aware readiness) |

### UX Design

```
┌─────────────────────────────────────────────────────────┐
│  Batch Results (47/50 extracted)                        │
│                                                         │
│  ┌─ Format Assignment ──────────────────────────────┐   │
│  │ [Dropdown: Select Format ▾] [Apply to Selected]  │   │
│  │ [☑ Select All] [Unselect All]   3 selected       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ☑ invoice_001.pdf  │ XRechnung CII │ ✓ Ready          │
│  ☐ invoice_002.pdf  │ Peppol BIS    │ ⚠ 2 errors       │
│  ☑ invoice_003.pdf  │ XRechnung CII │ ⚠ 1 missing      │
│  ☑ invoice_004.pdf  │ FatturaPA     │ ✓ Ready          │
│  ...                                                    │
│                                                         │
│  [Download All XML]  [New Upload]                       │
└─────────────────────────────────────────────────────────┘
```

### State Management

New state in `BulkUploadForm`:
- `selectedIds: Set<string>` — multi-select checkbox state
- `extractionFormats: Record<string, OutputFormat>` — per-extraction format (loaded from DB)
- `validationResults: Record<string, { errors, warnings, valid }>` — per-extraction validation

### Flow

1. After extraction completes → load extractions + their `output_format` from DB
2. Display format per row (from DB, fallback to detected)
3. User selects rows via checkboxes
4. User picks format from dropdown → clicks "Apply"
5. Call `POST /api/invoices/batch-format` with selected IDs + format
6. Call `POST /api/invoices/batch-validate` with selected IDs
7. Update UI with new validation results
8. Readiness checks use `FORMAT_FIELD_CONFIG[format]` instead of hardcoded checks

### Format-Aware Readiness

Replace the hardcoded `READINESS_CHECKS` array with a function that consults `FORMAT_FIELD_CONFIG`:

```typescript
function computeFormatReadiness(data: any, format: OutputFormat): { ready: boolean, missing: string[] } {
  const config = FORMAT_FIELD_CONFIG[format];
  const missing: string[] = [];
  // Check each field that is 'required' for this format
  if (config.sellerPhone === 'required' && !data.sellerPhone) missing.push('Seller Phone');
  if (config.sellerEmail === 'required' && !data.sellerEmail) missing.push('Seller Email');
  // ... etc
  return { ready: missing.length === 0, missing };
}
```

### Verification Gate
- `npx tsc --noEmit`
- `npx vitest run`
- `npm run build`
- `npm run lint`
- Manual: assign formats to subset, verify format persists after refresh

---

## Stage 4: Tests

### Goals
- Unit tests proving format assignment, validation, and generation are format-aware
- Integration tests proving DB persistence survives refresh

### Test Files

| File | Tests |
|------|-------|
| `__tests__/api/batch-format.test.ts` | **NEW** — format assignment API |
| `__tests__/api/batch-validate-formats.test.ts` | **NEW** — format-aware validation |
| `__tests__/api/batch-download-formats.test.ts` | **NEW** — format-aware download |
| `__tests__/lib/format-readiness.test.ts` | **NEW** — format-aware readiness checks |

### Test Cases

1. **Format Assignment Persistence**
   - Assign KSeF to 3 extractions → verify DB has `output_format = 'ksef'`
   - Re-read extractions → verify format survives (no silent fallback)

2. **Format-Specific Validation**
   - KSeF extraction: should NOT require IBAN/email/phone → valid
   - XRechnung extraction: MUST require IBAN/email/phone → errors if missing
   - Peppol extraction: MUST require electronic address + scheme → errors if missing
   - FatturaPA extraction: MUST require CodiceDestinatario → errors if missing

3. **Format-Aware Generation**
   - Download batch with mixed formats → ZIP contains correct XML types
   - Conversion uses DB-authoritative outputFormat (not silent fallback to xrechnung-cii)

4. **No Silent Defaulting**
   - Extraction with `output_format = 'peppol-bis'` in DB → batch-download uses Peppol generator
   - Never falls back to xrechnung-cii when a format is explicitly set

### Verification Gate
- All new tests pass
- `npx vitest run` — 0 failures
- Coverage thresholds maintained

---

## File Impact Matrix

| File | Stage | Change Type | Description |
|------|-------|-------------|-------------|
| `supabase/migrations/20260217_extraction_output_format.sql` | 0 | **NEW** | Add output_format to invoice_extractions |
| `app/api/invoices/batch-format/route.ts` | 0 | **NEW** | Bulk format assignment API |
| `services/invoice.db.service.ts` | 0 | EDIT | Add `updateExtractionFormat()` |
| `types/index.ts` | 0 | EDIT | Add `outputFormat` to InvoiceExtraction |
| `app/api/invoices/batch-validate/route.ts` | 1 | REFACTOR | Format-aware validation pipeline |
| `app/api/invoices/batch-download/route.ts` | 2 | REFACTOR | GeneratorFactory, per-extraction format |
| `components/forms/BulkUploadForm.tsx` | 3 | MAJOR EDIT | Multi-select, format dropdown, readiness |
| `__tests__/api/batch-format.test.ts` | 4 | **NEW** | Format assignment tests |
| `__tests__/api/batch-validate-formats.test.ts` | 4 | **NEW** | Format-aware validation tests |
| `__tests__/api/batch-download-formats.test.ts` | 4 | **NEW** | Format-aware download tests |
| `__tests__/lib/format-readiness.test.ts` | 4 | **NEW** | Readiness check tests |

---

## Format Rules Registry Summary

Already implemented in `validation/*-rules.ts` + `lib/format-field-config.ts`. Key per-format requirements:

| Format | Key Required Fields | Key Rules |
|--------|-------------------|-----------|
| **XRechnung CII/UBL** | Seller: phone, email, contactName, IBAN, address, VAT ID. Buyer: address, reference (warning). Payment terms. | BR-DE-1→23. Currency=EUR. SEPA IBAN. Electronic addresses BT-34/49. |
| **Peppol BIS** | Seller: VAT ID, electronic address + EAS scheme, address. Buyer: electronic address + scheme. | PEPPOL-EN16931-R001→R080. EAS codes (0088, 0192, 0106, etc.). |
| **Factur-X EN16931** | Seller: VAT ID, address. Buyer: country. Line items. | FX-COMMON-001→007. |
| **Factur-X Basic** | Same as EN16931 but payment terms optional. | Same + FX-BASIC-*. |
| **FatturaPA** | Seller: Partita IVA (11 digits), address. Buyer: CodiceDestinatario (7 chars), VAT. | FPA-001→030. SDI routing. RegimeFiscale RF01-19. |
| **KSeF** | Seller: NIP (10 digits), address. Minimal other requirements. | KSEF-001→010. Polish NIP validation. |
| **NLCIUS** | Seller: Dutch BTW (NL+9+B+2), electronic address (OIN/KVK), payment terms. | NLCIUS-001→010. OIN 0190 or KVK 0106. |
| **CIUS-RO** | Seller: CUI/CIF, electronic address, address. Similar to Peppol. | CIUS-RO-001→010. Romanian VAT format. |

Severity:
- **BLOCKING**: Missing required fields, invalid format-specific IDs, monetary inconsistencies
- **WARNING**: Missing buyer reference (XRechnung BR-DE-15), optional fields, non-standard codes

---

## GO/NO-GO Criteria

### GO (proceed to production)
- [ ] All 4 stages implemented and verified
- [ ] `npx tsc --noEmit` passes
- [ ] `npx vitest run` — 0 failures, coverage thresholds met
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] Manual tests:
  - [ ] Upload batch → assign KSeF to 3 invoices → only KSeF rules apply
  - [ ] Upload batch → assign XRechnung to 3 invoices → XRechnung rules apply
  - [ ] Upload batch → assign mixed formats → download ZIP with correct XML types
  - [ ] Refresh page → formats persist from DB (not reverted to default)
  - [ ] Selecting Peppol shows Peppol-specific errors (electronic address)
  - [ ] Selecting FatturaPA shows FatturaPA errors (CodiceDestinatario)

### NO-GO (rollback criteria)
- Any existing test breaks
- Format assignment silently loses data
- Conversion produces wrong XML format
- Silent fallback to xrechnung-cii when format is explicitly set
