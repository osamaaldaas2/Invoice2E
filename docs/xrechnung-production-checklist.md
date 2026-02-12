# XRechnung Production Checklist

## Supported Profiles

| Profile       | Format                               | Version                                                                 | Status      |
| ------------- | ------------------------------------ | ----------------------------------------------------------------------- | ----------- |
| XRechnung 3.0 | UN/CEFACT CII (CrossIndustryInvoice) | `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0` | Supported   |
| EN 16931:2017 | Base standard                        | Core invoice model                                                      | Implemented |

## Required Fields (Blocking)

These fields are validated as errors and will block XRechnung conversion if missing.

| Field                                 | Business Term | Rule                | Notes                                 |
| ------------------------------------- | ------------- | ------------------- | ------------------------------------- |
| Invoice number                        | BT-1          | SCHEMA-001          | Must be non-empty                     |
| Invoice date                          | BT-2          | SCHEMA-002          | Format: YYYY-MM-DD                    |
| Seller name                           | BT-27         | SCHEMA-003          |                                       |
| Buyer name                            | BT-44         | SCHEMA-004          |                                       |
| Total amount                          | BT-112        | SCHEMA-005          | Must be > 0 (except credit notes 381) |
| Line items                            | BG-25         | SCHEMA-006          | At least 1 required                   |
| Seller street address                 | BT-35         | BR-DE-1             |                                       |
| Seller contact (name + phone + email) | BG-6          | BR-DE-2             | All three required                    |
| Seller city                           | BT-37         | BR-DE-3             |                                       |
| Seller postal code                    | BT-38         | BR-DE-4             |                                       |
| Seller country code                   | BT-40         | BR-DE-5/9           | ISO 3166-1 alpha-2                    |
| Buyer country code                    | BT-55         | BR-DE-11            | ISO 3166-1 alpha-2                    |
| Seller IBAN                           | BT-84         | BR-DE-23-a          | Required for SEPA CT (TypeCode 58)    |
| Buyer electronic address              | BT-49         | PEPPOL-EN16931-R010 | Email or Peppol ID                    |
| Seller electronic address             | BT-34         | BR-DE-SELLER-EADDR  | Email or Peppol ID                    |
| Payment terms or due date             | BT-20/BT-9    | BR-CO-25            | At least one required                 |

## Warning Fields (Non-Blocking)

| Field                        | Business Term | Rule     | Notes                                                          |
| ---------------------------- | ------------- | -------- | -------------------------------------------------------------- |
| Buyer reference (Leitweg-ID) | BT-10         | BR-DE-15 | Recommended for public sector; invoice number used as fallback |

## Monetary Validation (Business Rules)

- **BR-CO-10**: Line extension amount = quantity x unit price (tolerance: 0.02)
- **BR-CO-13**: Subtotal = sum of line totals (tolerance: 0.02)
- **BR-CO-15**: Total = subtotal + tax amount (tolerance: 0.02)
- All arithmetic uses integer-cent representation to avoid floating-point errors.

## Tax Handling

- **Tax rate**: Nullable per line item. If AI does not detect a per-item rate, the field is sent as `undefined` (not 0).
- **Tax category code**: UNCL5305 values: S (Standard), Z (Zero), E (Exempt), AE (Reverse charge), K (Intra-EU), G (Export). Empty string maps to `undefined` on submit — the backend derives the code from the rate if not provided.
- **"Auto" label**: The UI displays "Auto" for the empty option, but the HTML value is `''`. Defense-in-depth: the submit handler also strips the literal string `'Auto'`.

## Common Failures

| Symptom                                    | Root Cause                                                   | Fix                                             |
| ------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------- |
| "Seller contact information is incomplete" | AI didn't extract phone or contact name                      | Fill in seller phone and contact on review form |
| "Seller IBAN is required"                  | IBAN missing or malformed                                    | Enter valid IBAN (whitespace is auto-stripped)  |
| "Buyer electronic address required"        | AI left buyerEmail blank                                     | Enter buyer email or Peppol ID                  |
| Tax rate shows "Not detected by AI"        | Per-item rate missing; invoice-level rate used as pre-fill   | Verify the pre-filled rate is correct           |
| Totals mismatch warning                    | Rounding differences between AI extraction and recalculation | Verify subtotal + tax = total on review form    |

## Validation Pipeline

The validation runs in 3 stages (all errors collected, not fail-fast):

1. **Schema validation** — required fields and type checks
2. **Business rules** — BR-CO monetary cross-checks (line totals, subtotal, tax)
3. **XRechnung profile rules** — BR-DE German-specific requirements

## External Validation (Optional)

External validation via the KoSIT validator CLI can be enabled for additional conformance checking.

### Setup

1. Download the KoSIT validator from https://github.com/itplr-kosit/validator
2. Download the XRechnung scenarios configuration
3. Set environment variables:

```env
ENABLE_EXTERNAL_VALIDATION=true
KOSIT_VALIDATOR_JAR=/path/to/validationtool-standalone.jar
KOSIT_SCENARIOS_XML=/path/to/scenarios.xml
```

### Behavior

- When `ENABLE_EXTERNAL_VALIDATION` is not `true`, external validation is skipped silently.
- When enabled but JAR/scenarios files are missing, a warning is logged and `{ ran: false }` is returned.
- The validator runs with a 60-second timeout.
- Results include `ran`, `valid`, `stdout`, `stderr`, and `error` fields.
- External validation never blocks the internal pipeline — it provides supplementary results.

## Security Notes

- Invoice data is processed in-memory; no extraction data is sent to external services (except the configured AI provider).
- IBAN values are normalized (whitespace stripped, uppercased) but not validated against bank registries.
- Rate limiting is applied to all API routes (review, bulk review, extraction, conversion).
- File uploads are validated for MIME type and size before processing.
- The `KOSIT_VALIDATOR_JAR` path is validated with `fs.existsSync` before execution — no arbitrary command injection is possible.

## Data Lineage

```
PDF upload
  → AI extraction (Gemini/DeepSeek) with shared prompt
  → Shared normalizer (extraction-normalizer.ts)
  → Database storage (extraction_data JSONB, original snapshot preserved)
  → Review form (frontend pre-fills, user edits)
  → Review API (validates, stores reviewed data)
  → XRechnung builder (maps to CII XML)
  → Validation pipeline (schema → business → profile)
  → Optional external validation (KoSIT)
  → XML download
```

## Testing

```bash
# Type checking
npx tsc --noEmit

# Unit tests (450+ tests)
npx vitest run --pool=forks

# Coverage check (thresholds: 60%)
npx vitest run --coverage
```

## Manual QA Script

1. Upload a German invoice PDF (single file)
2. Verify extraction fills review form fields
3. Check ReadinessPanel shows correct error/warning counts
4. Clear seller email → verify readiness drops, panel shows error icon
5. Clear buyer reference → verify panel shows warning icon (amber), not error
6. Set a line item's tax category to "Auto" → submit → verify payload has `undefined` (not "Auto")
7. Leave a line item's tax rate empty → verify "Not detected by AI" hint appears
8. Check totals section shows "Extracted: X.XX" when recalculated differs from AI-extracted
9. Submit review → verify conversion draft is created
10. Download XRechnung XML → verify it passes `xmllint` schema check
11. (If KoSIT enabled) Verify external validation result is logged
