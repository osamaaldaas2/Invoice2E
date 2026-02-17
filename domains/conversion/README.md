# Conversion Domain

## Purpose

The **conversion** bounded context handles transforming extracted invoice data into standardized e-invoice formats (ZUGFeRD, XRechnung, Factur-X).

## Responsibilities

- Convert canonical invoice data to target XML/PDF formats
- Validate output against EN 16931 and format-specific rules
- Manage conversion lifecycle (draft → validating → converting → completed/failed)
- Own conversion-specific types and format definitions

## Key Files

| File | Purpose |
|---|---|
| `types.ts` | Conversion-specific types and interfaces |
| `conversion.service.ts` | Orchestrates format conversion |
| `conversion.repository.ts` | Data access interface for conversions |
| `index.ts` | Barrel exports (public API) |

## Dependencies

- **Extraction domain**: Reads extracted data as input
- **Billing domain**: Credit deduction after successful conversion
- **Adapters**: Format-specific converters

## Migration Notes

Currently delegates to:
- `services/review.service.ts` — Data review/validation
- `services/invoice.db.service.ts` — Conversion DB operations
- `types/canonical-invoice.ts` — Canonical invoice model
