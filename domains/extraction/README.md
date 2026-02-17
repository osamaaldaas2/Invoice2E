# Extraction Domain

## Purpose

The **extraction** bounded context handles invoice data extraction from uploaded documents (PDFs, images) using AI providers (Gemini, OpenAI, Mistral).

## Responsibilities

- Orchestrate the extraction pipeline: upload → AI extraction → confidence scoring → storage
- Manage extraction lifecycle (draft → pending → processing → completed/failed)
- Own extraction-specific types and status transitions
- Provide repository interface for extraction persistence

## Key Files

| File | Purpose |
|---|---|
| `types.ts` | Extraction-specific types and interfaces |
| `extraction.service.ts` | Orchestrates the extraction flow |
| `extraction.repository.ts` | Data access interface for extractions |
| `index.ts` | Barrel exports (public API) |

## Dependencies

- **Adapters**: AI extractors (Gemini, OpenAI, Mistral) via adapter interfaces
- **Billing domain**: Credit deduction after successful extraction (cross-domain call)
- **Shared types**: `ExtractedInvoiceData`, `ExtractionStatus` from `types/`

## Migration Notes

Currently delegates to:
- `services/ai/extractor.factory.ts` — AI provider selection
- `services/gemini.service.ts` — Legacy Gemini extraction
- `services/invoice.db.service.ts` — Extraction DB operations
