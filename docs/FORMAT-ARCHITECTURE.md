# Format Architecture

## Overview

Invoice2E converts extracted invoice data into 9 standardised e-invoicing formats via a clean pipeline:

```
PDF/Image  →  AI Extraction  →  CanonicalInvoice  →  GeneratorFactory  →  IFormatGenerator  →  XML / PDF
                                       │
                                       └→  (per-generator validate())  →  errors / warnings
```

## Core Components

| Component | Path | Responsibility |
|-----------|------|----------------|
| `CanonicalInvoice` | `types/canonical-invoice.ts` | Universal data model (EN 16931 superset) |
| `OutputFormat` | `types/canonical-invoice.ts` | Union type of all 9 format IDs |
| `IFormatGenerator` | `services/format/IFormatGenerator.ts` | Generator interface + `GenerationResult` type |
| `GeneratorFactory` | `services/format/GeneratorFactory.ts` | Singleton factory — maps `OutputFormat` → generator |
| `FormatRegistry` | `lib/format-registry.ts` | Metadata catalogue (display names, MIME types, countries) |

## Data Flow

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────────────┐
│  Uploaded     │     │  AI Extractor   │     │  CanonicalInvoice    │
│  PDF / Image  │────▶│  (Gemini/GPT/   │────▶│  (EN 16931 model)    │
│               │     │   Mistral)      │     │                      │
└──────────────┘     └─────────────────┘     └──────────┬───────────┘
                                                        │
                                          ┌─────────────▼──────────────┐
                                          │     GeneratorFactory       │
                                          │  .create(outputFormat)     │
                                          └─────────────┬──────────────┘
                                                        │
                     ┌──────────────────────────────────┬┴──────────────────┐
                     │                                  │                   │
              ┌──────▼──────┐                  ┌────────▼─────┐    ┌───────▼──────┐
              │ XRechnung   │                  │  Factur-X    │    │  FatturaPA   │
              │ CII / UBL   │       ...        │  EN16931 /   │    │  KSeF, etc.  │
              │ Generator   │                  │  Basic       │    │              │
              └──────┬──────┘                  └────────┬─────┘    └───────┬──────┘
                     │                                  │                   │
                     ▼                                  ▼                   ▼
              GenerationResult                  GenerationResult    GenerationResult
              { xmlContent,                     { xmlContent,       { xmlContent,
                fileName,                         pdfContent?,        fileName,
                validationStatus }                mimeType }          validationStatus }
```

## Validation

Each generator implements its own `validate(xml)` method for structural validation of the output. There is no separate validator factory — validation is co-located with generation:

```typescript
interface IFormatGenerator {
  generate(invoice: CanonicalInvoice): Promise<GenerationResult>;
  validate(xml: string): Promise<{ valid: boolean; errors: string[] }>;
}
```

The `generate()` method internally validates and populates `validationStatus`, `validationErrors`, and `validationWarnings` in the result.

## Format Registry

`lib/format-registry.ts` provides runtime metadata (display name, countries, MIME type, file extension, syntax type) for each format. Used by the UI for format selection and by the API for response enrichment.

## All 9 Formats

| Format ID | Generator File | Syntax | Output |
|-----------|---------------|--------|--------|
| `xrechnung-cii` | `services/format/xrechnung-cii.generator.ts` | CII | XML |
| `xrechnung-ubl` | `services/format/xrechnung-ubl.generator.ts` | UBL | XML |
| `peppol-bis` | `services/format/peppol/peppol-bis.generator.ts` | UBL | XML |
| `facturx-en16931` | `services/format/facturx/facturx.generator.ts` | PDF+CII | PDF |
| `facturx-basic` | `services/format/facturx/facturx.generator.ts` | PDF+CII | PDF |
| `fatturapa` | `services/format/fatturapa/fatturapa.generator.ts` | FatturaPA | XML |
| `ksef` | `services/format/ksef/ksef.generator.ts` | KSeF | XML |
| `nlcius` | `services/format/nlcius/nlcius.generator.ts` | UBL | XML |
| `cius-ro` | `services/format/ciusro/ciusro.generator.ts` | UBL | XML |
