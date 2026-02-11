# ADR-002: Dual AI Provider Support (DeepSeek + Gemini)

## Status

Accepted

## Context

Invoice data extraction from PDF/image files is the core feature. Relying on a
single AI provider creates a single point of failure and limits negotiating leverage.
Different providers may perform better on different invoice formats.

## Decision

Support two AI providers via the ExtractorFactory pattern:

- **DeepSeek** (default): `AI_PROVIDER=deepseek` or unset
- **Gemini**: `AI_PROVIDER=gemini`

Both adapters use the same shared extraction prompt (`lib/extraction-prompt.ts`) and
produce the same `ExtractedInvoiceData` output. The provider is selected at runtime
via environment variable.

A separate `GeminiService` exists for the single-file upload flow
(`/api/invoices/convert`), while batch processing uses `ExtractorFactory`.

## Consequences

- Resilience: can switch providers if one has downtime or degraded quality
- Cost flexibility: can route to the cheaper provider
- Shared prompt ensures consistent extraction behavior across providers
- Must maintain two adapter implementations
- Normalization logic is shared via `lib/extraction-normalizer.ts`
