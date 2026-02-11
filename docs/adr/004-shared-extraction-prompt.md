# ADR-004: Single Shared Extraction Prompt

## Status

Accepted

## Context

Multiple code paths invoke AI providers for invoice extraction:

1. Single-file upload via GeminiService (`/api/invoices/convert`)
2. Batch upload via GeminiExtractor (Gemini adapter)
3. Batch upload via DeepSeekExtractor (DeepSeek adapter)

Each path was initially using its own prompt, leading to inconsistent extraction
results and duplicated prompt maintenance.

## Decision

Maintain a single extraction prompt in `lib/extraction-prompt.ts` (`EXTRACTION_PROMPT`),
imported by all three consumers. The prompt defines:

- Expected JSON output schema
- Field naming conventions (seller*, buyer*, lineItems)
- Critical extraction rules (address parsing, tax rate format, SEPA handling)

All normalization of AI responses is handled by a shared utility
(`lib/extraction-normalizer.ts`), ensuring consistent post-processing regardless
of which provider or code path produced the response.

## Consequences

- Single place to update extraction rules (DRY)
- Consistent output format across all providers
- Changes to the prompt affect all extraction paths simultaneously (intended)
- Provider-specific prompt tuning is not possible (acceptable trade-off)
