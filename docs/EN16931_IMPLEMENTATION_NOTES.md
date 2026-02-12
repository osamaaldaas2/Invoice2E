# EN 16931 Compliance Implementation Notes

**Date:** 2026-02-11
**Scope:** Phase 1 (P0 gap closure) + Phase 2 scaffold (validation pipeline)

---

## File-by-File Change Summary

### New Files Created

| File                                                   | Purpose                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `lib/monetary.ts`                                      | Decimal-safe arithmetic (integer-cents internally): `addMoney`, `computeTax`, `sumMoney`, `roundMoney`, `moneyEqual` |
| `lib/monetary-validator.ts`                            | BR-CO-10..16 monetary cross-checks: `validateMonetaryCrossChecks`, `groupByTaxRate`, `recomputeTotals`               |
| `validation/validation-result.ts`                      | Structured `ValidationError` and `ValidationResult` types with builder helpers                                       |
| `validation/validation-pipeline.ts`                    | 3-stage pipeline orchestrator: schema -> business rules -> XRechnung profile rules                                   |
| `validation/business-rules.ts`                         | BR-CO monetary rules adapter (wraps `monetary-validator` for pipeline)                                               |
| `validation/xrechnung-rules.ts`                        | BR-DE profile rules: BR-DE-1..5, BR-DE-11, BR-DE-15, BR-DE-23-a, PEPPOL-EN16931-R010, BR-CO-25                       |
| `tests/unit/lib/monetary.test.ts`                      | 24 tests for decimal-safe arithmetic                                                                                 |
| `tests/unit/lib/monetary-validator.test.ts`            | 13 tests for BR-CO cross-checks (single-rate, multi-rate, 100+ items, rounding edge cases)                           |
| `tests/unit/validation-pipeline.test.ts`               | 15 tests for full pipeline (schema, BR-DE, BR-CO, multi-error collection)                                            |
| `tests/unit/lib/extraction-normalizer-en16931.test.ts` | 17 tests for new field normalization (VAT ID detection, tax category codes, document type codes)                     |

### Modified Files

| File                                      | Changes                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types/index.ts`                          | Added `TaxCategoryCode`, `DocumentTypeCode` types. Added optional fields to `ExtractedInvoiceData`: `buyerVatId`, `sellerVatId`, `sellerTaxNumber`, `documentTypeCode`, `buyerReference`, `lineItems[].taxCategoryCode`                                                                                                      |
| `lib/extraction-prompt.ts`                | Extended AI prompt to request: `sellerVatId`, `sellerTaxNumber`, `buyerVatId`, `buyerReference`, `documentTypeCode`, `lineItems[].taxCategoryCode`                                                                                                                                                                           |
| `lib/extraction-normalizer.ts`            | Added `normalizeTaxCategoryCode()`, `isEuVatId()`. Extended `normalizeExtractedData()` to handle new fields with auto-derivation (VAT ID from taxId, category code from rate)                                                                                                                                                |
| `services/xrechnung/types.ts`             | Added `buyerVatId`, `sellerVatId`, `sellerTaxNumber`, `documentTypeCode`, `taxCategoryCode` to `XRechnungInvoiceData` and `XRechnungLineItem`. Added `structuredErrors` to `XRechnungGenerationResult`                                                                                                                       |
| `services/xrechnung/validator.ts`         | Replaced 11-rule manual checker with full validation pipeline integration. Now calls `validateForXRechnung()` and returns structured `ValidationResult`                                                                                                                                                                      |
| `services/xrechnung/builder.ts`           | P0-1: VAT ID/Tax Number separation (`buildSellerTaxRegistrations`). P0-2: Buyer VAT ID mapping. P0-7: Expanded tax categories (S/Z/E/AE/K/G) with exemption reasons. P1-1: Document TypeCode from data (not hardcoded 380). P1-10: Notes mapped to `ram:IncludedNote`. Decimal-safe arithmetic via `computeTax`/`roundMoney` |
| `services/xrechnung/xrechnung.service.ts` | Integrated validation pipeline; returns structured warnings alongside legacy string arrays                                                                                                                                                                                                                                   |
| `services/review.service.ts`              | P1-8: Added `validateMonetaryConsistency()` — server-side authoritative check (subtotal + tax = total, line sum = subtotal). Used decimal-safe `recalculateTotals()`                                                                                                                                                         |
| `lib/constants.ts`                        | No changes needed (already had `DEFAULT_VAT_RATE`, `REDUCED_VAT_RATE`)                                                                                                                                                                                                                                                       |
| `tests/unit/xrechnung.service.test.ts`    | Updated test data to include `sellerPhone`, `sellerIban` (now required by pipeline)                                                                                                                                                                                                                                          |

---

## Implemented Rules

### BR-CO (Monetary Cross-Checks) — `lib/monetary-validator.ts`

| Rule         | Description                                    | Location                      |
| ------------ | ---------------------------------------------- | ----------------------------- |
| BR-CO-10     | Sum of line net amounts = invoice subtotal     | `validateMonetaryCrossChecks` |
| BR-CO-13     | Invoice total without VAT = subtotal           | `validateMonetaryCrossChecks` |
| BR-CO-14     | Each tax group: tax = basis \* rate            | `validateMonetaryCrossChecks` |
| BR-CO-14-SUM | Total tax = sum of tax breakdowns              | `validateMonetaryCrossChecks` |
| BR-CO-15     | Total with VAT = total without VAT + total tax | `validateMonetaryCrossChecks` |

### BR-DE (XRechnung Profile) — `validation/xrechnung-rules.ts`

| Rule                | Description                                     | Level   |
| ------------------- | ----------------------------------------------- | ------- |
| BR-DE-1             | Seller street address required                  | Error   |
| BR-DE-2             | Seller contact (name + phone + email) mandatory | Error   |
| BR-DE-3             | Seller city required                            | Error   |
| BR-DE-4             | Seller postal code required                     | Error   |
| BR-DE-5             | Seller country code required                    | Error   |
| BR-DE-11            | Buyer country code required                     | Error   |
| BR-DE-15            | Buyer reference (Leitweg-ID) recommended        | Warning |
| BR-DE-23-a          | IBAN required for SEPA (TypeCode 58)            | Error   |
| BR-CO-25            | Payment terms or due date required              | Error   |
| PEPPOL-EN16931-R010 | Buyer electronic address required               | Error   |
| BR-DE-SELLER-EADDR  | Seller electronic address required              | Error   |

### Schema Rules — `validation/validation-pipeline.ts`

| Rule            | Description                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------- |
| SCHEMA-001..006 | Required fields: invoice number, date, seller name, buyer name, total > 0, line items present |

---

## Test Inventory

| Test File                                              | Count   | Coverage                                                                                         |
| ------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------ |
| `tests/unit/lib/monetary.test.ts`                      | 24      | Decimal-safe arithmetic: IEEE 754 edge cases, 0.005 rounding boundary, 100-item drift test       |
| `tests/unit/lib/monetary-validator.test.ts`            | 13      | BR-CO rules: single-rate, multi-rate, exempt, 100+ items, rounding edges, tax mismatch detection |
| `tests/unit/validation-pipeline.test.ts`               | 15      | Full pipeline: schema errors, BR-DE-2/3/4/23-a, PEPPOL-R010, BR-CO-10/15, multi-error collection |
| `tests/unit/lib/extraction-normalizer-en16931.test.ts` | 17      | New field normalization: EU VAT ID detection, tax category codes, document type, auto-derivation |
| **Total new tests**                                    | **69**  |                                                                                                  |
| **Total all tests**                                    | **390** | All passing                                                                                      |

---

## P0 Gap Closure Status

| Gap                                  | Status | Implementation                                                                       |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------ |
| P0-1 VAT ID / Tax Number separation  | Closed | `builder.ts:buildSellerTaxRegistrations()` with schemeID VA/FC                       |
| P0-2 Buyer VAT ID mapping            | Closed | `builder.ts:buildBuyerTradeParty()` maps to SpecifiedTaxRegistration                 |
| P0-3 BR-DE-2 seller contact enforced | Closed | `xrechnung-rules.ts` enforces as blocking error                                      |
| P0-4 BR-DE-23-a IBAN enforced        | Closed | `xrechnung-rules.ts` enforces as blocking error                                      |
| P0-5 Buyer electronic address        | Closed | `xrechnung-rules.ts` (PEPPOL-EN16931-R010) + `builder.ts` URICommunication           |
| P0-6 Seller electronic address       | Closed | `xrechnung-rules.ts` (BR-DE-SELLER-EADDR) + `builder.ts` URICommunication            |
| P0-7 Tax category codes expanded     | Closed | `builder.ts` supports S/Z/E/AE/K/G with exemption reasons                            |
| P0-8 Monetary cross-checks           | Closed | `monetary-validator.ts` implements BR-CO-10..16; `validation-pipeline.ts` integrates |

## P1 Gaps Addressed

| Gap                                  | Status | Implementation                                                                         |
| ------------------------------------ | ------ | -------------------------------------------------------------------------------------- |
| P1-1 Document type code              | Closed | `builder.ts:buildExchangedDocument()` uses `data.documentTypeCode` (not hardcoded 380) |
| P1-7 Decimal-safe arithmetic         | Closed | `lib/monetary.ts` used throughout builder, validator, review service                   |
| P1-8 Server-side monetary validation | Closed | `review.service.ts:validateMonetaryConsistency()`                                      |
| P1-10 Invoice notes mapping          | Closed | `builder.ts:buildExchangedDocument()` maps notes to `ram:IncludedNote`                 |

---

## Remaining Known Gaps

| Gap                              | Rationale                                 |
| -------------------------------- | ----------------------------------------- |
| P1-2 Allowances/charges          | Requires domain model expansion (Phase 2) |
| P1-3 Invoice period              | Requires form UI changes (Phase 5)        |
| P1-4 Preceding invoice reference | Requires credit note workflow (Phase 5)   |
| P1-5 Multiple payment means      | Requires form UI changes (Phase 5)        |
| P1-6 Delivery information        | Low priority, optional in EN 16931        |
| P1-9 Item classification codes   | Low priority, optional                    |
| P2-\* Structural improvements    | Planned for Phases 2-5 per roadmap        |

---

## Backward Compatibility

- **No breaking API changes** — all new fields are optional
- **No DB migration** — JSONB schema accommodates new fields automatically
- **Existing stored extractions** — load without crashes (new fields default to `undefined`/`null`)
- **Existing API responses** — unchanged; `structuredErrors` added additively to generation result
- **Existing review form** — works as before; monetary consistency check added server-side
