# Mistral AI Integration Plan — Invoice2E

**Author:** Auto-generated analysis  
**Date:** 2026-02-15  
**Status:** Draft  
**Scope:** Add Mistral as 4th AI provider with two-step OCR + Chat extraction pipeline

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [New Files to Create](#3-new-files-to-create)
4. [Existing Files to Modify](#4-existing-files-to-modify)
5. [Implementation Details](#5-implementation-details)
6. [Environment Variables](#6-environment-variables)
7. [Testing Strategy](#7-testing-strategy)
8. [Risk Assessment](#8-risk-assessment)
9. [Rollback Strategy](#9-rollback-strategy)
10. [Implementation Order](#10-implementation-order)

---

## 1. Executive Summary

Add **Mistral AI** as a 4th extraction provider alongside OpenAI, Gemini, and DeepSeek. Mistral is EU-based (France), resolving GDPR/DSGVO data residency concerns.

**Key differentiator:** Mistral uses a **two-step pipeline**:

1. **Mistral OCR API** (`POST https://api.mistral.ai/v1/ocr`) — extracts raw text/markdown from PDFs, replacing unpdf + Tesseract.js
2. **Mistral Chat API** (`POST https://api.mistral.ai/v1/chat/completions`) — takes extracted text + prompt → returns structured invoice JSON

This contrasts with OpenAI/Gemini/DeepSeek which send the PDF binary directly to the vision model.

---

## 2. Architecture Overview

### Current Flow (OpenAI/Gemini/DeepSeek)

```
PDF Buffer → extractText(unpdf/Tesseract) → [optional text] → AI Vision API (PDF + prompt) → JSON → normalize → validate → retry
```

### Mistral Flow (Two-Step)

```
PDF Buffer → Mistral OCR API → markdown text → Mistral Chat API (text + prompt) → JSON → normalize → validate → retry
```

### Component Map

```
NEW FILES:
  adapters/mistral.adapter.ts          — Mistral API adapter (OCR + Chat)
  adapters/interfaces/IMistralAdapter.ts — Interface definition
  services/ai/mistral.extractor.ts     — Extractor implementing IAIExtractor

MODIFIED FILES:
  lib/constants.ts                     — Add MISTRAL_RATE_LIMIT, ENABLE_MISTRAL_OCR, timeout
  lib/api-throttle.ts                  — Add mistralThrottle singleton
  lib/text-extraction.ts              — Add Mistral OCR route (behind feature flag)
  lib/extraction-normalizer.ts        — Handle taxRate as array → null
  adapters/index.ts                   — Export mistral adapter
  adapters/interfaces/index.ts        — Export IMistralAdapter
  services/ai/extractor.factory.ts    — Add 'mistral' case
  services/boundary-detection.service.ts — Add mistral adapter for boundary detection
  types/index.ts                      — No changes needed (ExtractedInvoiceData already sufficient)
```

---

## 3. New Files to Create

### 3.1 `adapters/interfaces/IMistralAdapter.ts`

**Purpose:** Interface for the Mistral adapter, following the existing pattern (IOpenAIAdapter, IDeepSeekAdapter).

```typescript
import { ExtractedInvoiceData } from '@/types';

export interface IMistralAdapter {
  /** Standard extraction (two-step: OCR → Chat) */
  extractInvoiceData(fileBuffer: Buffer, mimeType: string): Promise<MistralExtractionResult>;

  /** Send a raw prompt with file context (for boundary detection) */
  sendPrompt(fileBuffer: Buffer, mimeType: string, prompt: string): Promise<string>;

  getProviderName(): string;
  validateConfiguration(): boolean;

  /** Extract with pre-extracted text (skips OCR step) */
  extractWithText?(
    fileBuffer: Buffer,
    mimeType: string,
    options?: { extractedText?: string }
  ): Promise<MistralExtractionResult>;

  /** Retry extraction with validation error context */
  extractWithRetry?(
    fileBuffer: Buffer,
    mimeType: string,
    retryPrompt: string
  ): Promise<MistralExtractionResult>;

  /** OCR-only: extract text/markdown from PDF via Mistral OCR API */
  extractTextWithOcr?(fileBuffer: Buffer, mimeType: string): Promise<string>;
}

export interface MistralExtractionResult {
  data: ExtractedInvoiceData;
  confidence: number;
  processingTimeMs: number;
  rawResponse?: unknown;
}
```

**Pattern:** Mirrors `IDeepSeekAdapter` with optional `extractWithText`, `extractWithRetry`, plus a new `extractTextWithOcr` method unique to Mistral.

---

### 3.2 `adapters/mistral.adapter.ts`

**Purpose:** Axios-based adapter implementing `IMistralAdapter`. Handles both OCR and Chat API calls.

**Key design decisions:**

- Uses `axios` like OpenAI/DeepSeek adapters (NOT the Google SDK pattern used by Gemini)
- OCR endpoint: `POST https://api.mistral.ai/v1/ocr`
- Chat endpoint: `POST https://api.mistral.ai/v1/chat/completions`
- Single API key for both endpoints
- Token bucket throttle via `mistralThrottle`

**Structure:**

```typescript
import axios from 'axios';
import { API_TIMEOUTS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { AppError, ValidationError } from '@/lib/errors';
import { IMistralAdapter, MistralExtractionResult } from './interfaces';
import { ExtractedInvoiceData } from '@/types';
import { EXTRACTION_PROMPT_WITH_TEXT, EXTRACTION_PROMPT_VISION } from '@/lib/extraction-prompt';
import { normalizeExtractedData, parseJsonFromAiResponse } from '@/lib/extraction-normalizer';
import { mistralThrottle } from '@/lib/api-throttle';

export class MistralAdapter implements IMistralAdapter {
  private readonly configApiKey?: string;
  private readonly timeout: number;

  constructor(config?: { apiKey?: string; timeout?: number }) {
    this.configApiKey = config?.apiKey;
    this.timeout = config?.timeout ?? API_TIMEOUTS.MISTRAL_EXTRACTION;
  }

  private get apiKey(): string {
    return this.configApiKey ?? process.env.MISTRAL_API_KEY ?? '';
  }

  private get chatApiUrl(): string {
    return 'https://api.mistral.ai/v1/chat/completions';
  }

  private get ocrApiUrl(): string {
    return 'https://api.mistral.ai/v1/ocr';
  }

  private get chatModel(): string {
    return process.env.MISTRAL_MODEL ?? 'mistral-small-latest';
  }

  private get ocrModel(): string {
    return process.env.MISTRAL_OCR_MODEL ?? 'mistral-ocr-latest';
  }

  // --- OCR Step ---
  async extractTextWithOcr(fileBuffer: Buffer, mimeType: string): Promise<string> {
    await mistralThrottle.acquire();

    const base64Data = fileBuffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64Data}`;

    const payload = {
      model: this.ocrModel,
      document: {
        type: 'document_url',
        document_url: dataUri,
      },
    };

    try {
      const response = await axios.post(this.ocrApiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: this.timeout,
      });

      // Mistral OCR returns pages[].markdown
      const pages = response.data?.pages;
      if (!Array.isArray(pages) || pages.length === 0) {
        throw new AppError('MISTRAL_ERROR', 'Empty OCR response from Mistral', 500);
      }

      const fullText = pages.map((p: { markdown: string }) => p.markdown).join('\n\n---\n\n');
      logger.info('Mistral OCR completed', {
        pageCount: pages.length,
        textLength: fullText.length,
      });

      return fullText;
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        (error.code === 'ECONNABORTED' || error.message?.includes('timeout'))
      ) {
        throw new AppError('MISTRAL_TIMEOUT', 'Mistral OCR request timed out', 504);
      }
      if (error instanceof AppError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new AppError('MISTRAL_ERROR', `Mistral OCR failed: ${msg}`, 500);
    }
  }

  // --- Chat Step ---
  private async callChat(prompt: string): Promise<Record<string, unknown>> {
    await mistralThrottle.acquire();

    const payload = {
      model: this.chatModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 16000,
      temperature: 0,
      response_format: { type: 'json_object' },
    };

    try {
      const response = await axios.post(this.chatApiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: this.timeout,
      });

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new AppError('MISTRAL_ERROR', 'Empty chat response from Mistral', 500);
      }

      return parseJsonFromAiResponse(content) as Record<string, unknown>;
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        (error.code === 'ECONNABORTED' || error.message?.includes('timeout'))
      ) {
        throw new AppError('MISTRAL_TIMEOUT', 'Mistral Chat request timed out', 504);
      }
      if (error instanceof AppError) throw error;
      if (error instanceof SyntaxError) {
        throw new AppError('MISTRAL_ERROR', 'Invalid JSON in Mistral response', 500);
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new AppError('MISTRAL_ERROR', `Mistral Chat failed: ${msg}`, 500);
    }
  }

  // --- Two-Step Extraction ---
  async extractInvoiceData(fileBuffer: Buffer, mimeType: string): Promise<MistralExtractionResult> {
    const startTime = Date.now();

    if (!this.apiKey) throw new AppError('CONFIG_ERROR', 'Mistral API not configured', 500);
    if (!fileBuffer || fileBuffer.length === 0) throw new ValidationError('Empty file buffer');

    // Step 1: OCR
    const ocrText = await this.extractTextWithOcr(fileBuffer, mimeType);

    // Step 2: Chat extraction
    const prompt = EXTRACTION_PROMPT_WITH_TEXT + ocrText.substring(0, 50000);
    const data = await this.callChat(prompt);
    const normalizedData = normalizeExtractedData(data);

    const processingTimeMs = Date.now() - startTime;
    const finalResult: ExtractedInvoiceData = {
      ...normalizedData,
      processingTimeMs,
      confidence: normalizedData.confidence || 0.7,
    };

    return {
      data: finalResult,
      confidence: finalResult.confidence ?? 0.7,
      processingTimeMs,
    };
  }

  async extractWithText(
    fileBuffer: Buffer,
    mimeType: string,
    options?: { extractedText?: string }
  ): Promise<MistralExtractionResult> {
    const startTime = Date.now();
    if (!this.apiKey) throw new AppError('CONFIG_ERROR', 'Mistral API not configured', 500);
    if (!fileBuffer || fileBuffer.length === 0) throw new ValidationError('Empty file buffer');

    // If text already provided (e.g., from Mistral OCR or other source), skip OCR
    let text = options?.extractedText;
    if (!text) {
      text = await this.extractTextWithOcr(fileBuffer, mimeType);
    }

    const prompt = EXTRACTION_PROMPT_WITH_TEXT + text.substring(0, 50000);
    const data = await this.callChat(prompt);
    const normalizedData = normalizeExtractedData(data);

    const processingTimeMs = Date.now() - startTime;
    const finalResult: ExtractedInvoiceData = {
      ...normalizedData,
      processingTimeMs,
      confidence: normalizedData.confidence || 0.7,
    };

    return {
      data: finalResult,
      confidence: finalResult.confidence ?? 0.7,
      processingTimeMs,
    };
  }

  async extractWithRetry(
    _fileBuffer: Buffer,
    _mimeType: string,
    retryPrompt: string
  ): Promise<MistralExtractionResult> {
    const startTime = Date.now();
    if (!this.apiKey) throw new AppError('CONFIG_ERROR', 'Mistral API not configured', 500);

    // Retry is text-only (no need to re-OCR)
    const data = await this.callChat(retryPrompt);
    const normalizedData = normalizeExtractedData(data);

    const processingTimeMs = Date.now() - startTime;
    const finalResult: ExtractedInvoiceData = {
      ...normalizedData,
      processingTimeMs,
      confidence: normalizedData.confidence || 0.7,
    };

    return {
      data: finalResult,
      confidence: finalResult.confidence ?? 0.7,
      processingTimeMs,
    };
  }

  async sendPrompt(fileBuffer: Buffer, mimeType: string, prompt: string): Promise<string> {
    if (!this.apiKey) throw new AppError('CONFIG_ERROR', 'Mistral API not configured', 500);
    if (!fileBuffer || fileBuffer.length === 0) throw new ValidationError('Empty file buffer');

    // For boundary detection: OCR the PDF first, then send text + prompt to chat
    const ocrText = await this.extractTextWithOcr(fileBuffer, mimeType);
    const fullPrompt = `${prompt}\n\nDOCUMENT TEXT:\n${ocrText.substring(0, 50000)}`;

    await mistralThrottle.acquire();

    const payload = {
      model: this.chatModel,
      messages: [{ role: 'user', content: fullPrompt }],
      max_tokens: 4000,
      temperature: 0,
    };

    try {
      const response = await axios.post(this.chatApiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: this.timeout,
      });

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) throw new AppError('MISTRAL_ERROR', 'Empty response from Mistral', 500);
      return content;
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        (error.code === 'ECONNABORTED' || error.message?.includes('timeout'))
      ) {
        throw new AppError('MISTRAL_TIMEOUT', 'Mistral API request timed out', 504);
      }
      if (error instanceof AppError) throw error;
      throw new AppError(
        'MISTRAL_ERROR',
        `Mistral sendPrompt failed: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  getProviderName(): string {
    return 'mistral';
  }

  validateConfiguration(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }
}

export const mistralAdapter = new MistralAdapter();
```

**Risk:** Mistral OCR API response format (`pages[].markdown`) needs verification against actual API docs. The `document_url` field accepting `data:` URIs needs confirmation — may need file upload via `/v1/files` first.

---

### 3.3 `services/ai/mistral.extractor.ts`

**Purpose:** Extractor implementing `IAIExtractor`, following the DeepSeek/Gemini pattern with validation + retry.

```typescript
import { IAIExtractor, ExtractedInvoiceData } from './IAIExtractor';
import { mistralAdapter } from '@/adapters';
import { IMistralAdapter } from '@/adapters/interfaces';
import { extractText } from '@/lib/text-extraction';
import { validateExtraction } from '@/lib/extraction-validator';
import { buildRetryPrompt, shouldRetry } from '@/lib/extraction-retry';
import { ENABLE_TEXT_EXTRACTION, ENABLE_EXTRACTION_RETRY } from '@/lib/constants';
import { logger } from '@/lib/logger';

export class MistralExtractor implements IAIExtractor {
  constructor(private adapter: IMistralAdapter = mistralAdapter) {}

  validateConfiguration(): boolean {
    return this.adapter.validateConfiguration();
  }

  getProviderName(): string {
    return 'Mistral';
  }

  async extractFromFile(
    buffer: Buffer,
    _fileName: string,
    fileType: string
  ): Promise<ExtractedInvoiceData> {
    // Mistral uses its own OCR, so we prefer extractWithText with Mistral OCR
    if ('extractWithText' in this.adapter && this.adapter.extractWithText) {
      let extractedText: string | undefined;

      // Use Mistral's own OCR if available, otherwise fall back to unpdf/Tesseract
      if ('extractTextWithOcr' in this.adapter && this.adapter.extractTextWithOcr) {
        try {
          extractedText = await this.adapter.extractTextWithOcr!(buffer, fileType);
          logger.info('Mistral OCR text extracted', { textLength: extractedText.length });
        } catch (error) {
          logger.warn('Mistral OCR failed, falling back to local extraction', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Fallback to local text extraction if Mistral OCR failed
      if (!extractedText && ENABLE_TEXT_EXTRACTION) {
        try {
          const textResult = await extractText(buffer, fileType);
          if (textResult.hasText) {
            extractedText = textResult.text;
            logger.info('Fallback text extraction for Mistral', {
              source: textResult.source,
              textLength: textResult.text.length,
            });
          }
        } catch (error) {
          logger.warn('Fallback text extraction also failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      let result = await this.adapter.extractWithText!(buffer, fileType, { extractedText });
      let data = result.data;

      // Validation + retry
      if (
        ENABLE_EXTRACTION_RETRY &&
        'extractWithRetry' in this.adapter &&
        this.adapter.extractWithRetry
      ) {
        let validation = validateExtraction(data);
        let attempt = 0;

        while (!validation.valid && shouldRetry(attempt)) {
          attempt++;
          logger.info('Mistral extraction validation failed, retrying', {
            attempt,
            errors: validation.errors.length,
          });

          const retryPrompt = buildRetryPrompt({
            originalJson: JSON.stringify(data),
            validationErrors: validation.errors,
            extractedText,
            attempt,
          });

          result = await this.adapter.extractWithRetry!(buffer, fileType, retryPrompt);
          data = result.data;
          validation = validateExtraction(data);
        }

        if (!validation.valid) {
          data.confidence = Math.max(0.3, (data.confidence ?? 0.7) - 0.2);
          logger.warn('Mistral extraction still has validation errors after retries', {
            errors: validation.errors,
          });
        }
      }

      return data;
    }

    // Fallback to standard extraction (two-step OCR → Chat)
    const result = await this.adapter.extractInvoiceData(buffer, fileType);
    return result.data;
  }
}
```

**Pattern:** Nearly identical to `DeepSeekExtractor` but uses Mistral's own OCR as the primary text source instead of `extractText()`.

---

## 4. Existing Files to Modify

### 4.1 `lib/constants.ts`

**Changes:**

```typescript
// ADD: Mistral API timeout
API_TIMEOUTS.MISTRAL_EXTRACTION = 90000; // 90 seconds (OCR + Chat combined)

// ADD: Mistral rate limiting
export const MISTRAL_RATE_LIMIT = {
  MAX_TOKENS: 5, // Burst capacity
  REFILL_PER_SEC: 1, // Conservative: 1/sec (~60 RPM)
} as const;

// ADD: Feature flag for Mistral OCR
export const ENABLE_MISTRAL_OCR = true;
```

**Why:** Centralized constants (project constitution rule). Mistral rate limit is conservative at 1/sec since we make 2 API calls per extraction (OCR + Chat).

**Risk:** None — additive only.

---

### 4.2 `lib/api-throttle.ts`

**Changes:**

```typescript
// ADD import
import { MISTRAL_RATE_LIMIT } from '@/lib/constants';

// ADD singleton
export const mistralThrottle = new TokenBucketThrottle(
  MISTRAL_RATE_LIMIT.MAX_TOKENS,
  MISTRAL_RATE_LIMIT.REFILL_PER_SEC
);
```

**Why:** Rate limiting for Mistral API to prevent 429 errors. Each extraction makes 2 calls (OCR + Chat), so each `acquire()` is called twice per extraction.

**Risk:** None — additive only.

---

### 4.3 `lib/text-extraction.ts`

**Changes:** Add Mistral OCR as an extraction source behind `ENABLE_MISTRAL_OCR` feature flag.

```typescript
// ADD import
import { ENABLE_MISTRAL_OCR } from '@/lib/constants';

// ADD: in extractText(), before the existing PDF/OCR logic:
if (ENABLE_MISTRAL_OCR && process.env.MISTRAL_API_KEY && process.env.AI_PROVIDER === 'mistral') {
  try {
    const { mistralAdapter } = await import('@/adapters/mistral.adapter');
    const ocrText = await mistralAdapter.extractTextWithOcr(fileBuffer, mimeType);
    if (ocrText.length > 0) {
      return {
        hasText: true,
        text: ocrText,
        pageCount: 1, // Mistral OCR doesn't give page count separately
        source: 'mistral-ocr' as any, // Extend TextExtractionResult.source type
      };
    }
  } catch (error) {
    logger.warn('Mistral OCR failed, falling back to local extraction', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
```

**Also update `TextExtractionResult.source`:**

```typescript
source: 'pdf-parse' | 'ocr' | 'mistral-ocr' | 'none';
```

**Why:** When `AI_PROVIDER=mistral`, use Mistral's OCR instead of unpdf/Tesseract. The feature flag `ENABLE_MISTRAL_OCR` allows disabling it independently.

**Risk:** Dynamic import ensures no bundle bloat when Mistral isn't used. Fallback to existing pipeline on failure.

**Note:** Actually, the MistralExtractor already handles its own OCR internally. This change to `text-extraction.ts` is **optional** — it would allow other providers to use Mistral OCR as a text source. Consider deferring this to a follow-up if not needed immediately.

---

### 4.4 `lib/extraction-normalizer.ts`

**Changes:** Handle `taxRate` as array → convert to `null`.

In `normalizeExtractedData()`, before the existing `normalizeTaxRate(data.taxRate)` call:

```typescript
// FIX: Mistral sometimes returns taxRate as array (e.g., [19, 7] for mixed rates)
// Convert to null — mixed-rate invoices should use per-line-item rates only
const rawTaxRate = Array.isArray(data.taxRate) ? null : data.taxRate;
const parsedTaxRate = normalizeTaxRate(rawTaxRate);
```

Similarly, in the `lineItems.map()` callback:

```typescript
// FIX: Handle array taxRate on line items too
const rawItemRate = Array.isArray(item?.taxRate) ? null : item?.taxRate;
const itemTaxRate = normalizeTaxRate(rawItemRate);
```

**Why:** Mistral returns `[19, 7]` when an invoice has mixed VAT rates (standard 19% + reduced 7%). The document-level `taxRate` should be `null` when rates differ; per-item rates handle the distinction.

**Risk:** Low — adds a guard before existing logic. Does not affect other providers (they don't return arrays).

---

### 4.5 `adapters/index.ts`

**Changes:**

```typescript
// ADD
export * from './mistral.adapter';
```

**Why:** Export the new adapter for use in factory and boundary detection.

**Risk:** None — additive only.

---

### 4.6 `adapters/interfaces/index.ts`

**Changes:**

```typescript
// ADD
export * from './IMistralAdapter';
```

**Why:** Export the new interface.

**Risk:** None — additive only.

---

### 4.7 `services/ai/extractor.factory.ts`

**Changes:**

```typescript
// ADD import
import { MistralExtractor } from './mistral.extractor';

// UPDATE type
export type AIProvider = 'gemini' | 'deepseek' | 'openai' | 'mistral' | 'aws';

// ADD case in switch
case 'mistral':
  extractor = new MistralExtractor();
  break;

// UPDATE getAvailableProviders
static getAvailableProviders(): AIProvider[] {
  return ['gemini', 'deepseek', 'openai', 'mistral'];
}
```

**Why:** Register Mistral in the factory pattern.

**Risk:** None — additive only. Existing providers unchanged.

---

### 4.8 `services/boundary-detection.service.ts`

**Changes:**

```typescript
// ADD import
import { mistralAdapter } from '@/adapters/mistral.adapter';

// UPDATE adapter selection in detect():
if (aiProvider === 'mistral') {
  adapter = mistralAdapter;
}
```

Add this as an `else if` in the existing adapter selection block (after `openai`, before the `else` that defaults to `deepseek`).

**Why:** Support Mistral for boundary detection. Mistral's `sendPrompt()` will OCR the PDF first, then pass text + boundary prompt to chat — which is fine since boundary detection only needs text understanding, not vision.

**Risk:** Low. Mistral's two-step approach for boundary detection is slightly slower (extra OCR call), but boundary detection is already a lighter call with a 30s timeout.

---

## 5. Implementation Details

### 5.1 Mistral OCR API Request/Response

**Request:**

```json
POST https://api.mistral.ai/v1/ocr
Authorization: Bearer <MISTRAL_API_KEY>
Content-Type: application/json

{
  "model": "mistral-ocr-latest",
  "document": {
    "type": "document_url",
    "document_url": "data:application/pdf;base64,<base64data>"
  }
}
```

**Response:**

```json
{
  "pages": [
    { "index": 0, "markdown": "# Invoice\n\nInvoice Number: 2024-001\n..." },
    { "index": 1, "markdown": "## Line Items\n\n| Pos | Description | ..." }
  ]
}
```

⚠️ **Action required:** Verify this response format against the actual Mistral OCR API documentation. The `document_url` field accepting `data:` URIs also needs verification — if not supported, the adapter must first upload to `/v1/files` and pass the file ID.

### 5.2 Mistral Chat API Request/Response

**Request:** Standard OpenAI-compatible format.

```json
POST https://api.mistral.ai/v1/chat/completions
Authorization: Bearer <MISTRAL_API_KEY>
Content-Type: application/json

{
  "model": "mistral-small-latest",
  "messages": [{ "role": "user", "content": "<prompt + OCR text>" }],
  "max_tokens": 16000,
  "temperature": 0,
  "response_format": { "type": "json_object" }
}
```

**Note:** Mistral supports `response_format: { type: "json_object" }` but does NOT support OpenAI's `json_schema` structured outputs. The adapter uses `json_object` mode + `parseJsonFromAiResponse()` for robustness.

### 5.3 Token Budget

Each Mistral extraction consumes **2 throttle tokens** (1 for OCR, 1 for Chat). With `REFILL_PER_SEC: 1` and `MAX_TOKENS: 5`:

- Burst: 2 immediate extractions (using 4 tokens), then ~1 extraction per 2 seconds
- Sustained: ~30 extractions per minute

This is conservative. Adjust `REFILL_PER_SEC` after testing actual Mistral rate limits.

---

## 6. Environment Variables

| Variable             | Required                 | Default                | Description                          |
| -------------------- | ------------------------ | ---------------------- | ------------------------------------ |
| `MISTRAL_API_KEY`    | Yes (when using Mistral) | —                      | Mistral API key                      |
| `MISTRAL_MODEL`      | No                       | `mistral-small-latest` | Chat model for structured extraction |
| `MISTRAL_OCR_MODEL`  | No                       | `mistral-ocr-latest`   | OCR model for text extraction        |
| `AI_PROVIDER`        | No                       | `gemini`               | Set to `mistral` to use Mistral      |
| `ENABLE_MISTRAL_OCR` | No                       | `true` (constant)      | Feature flag for Mistral OCR         |

**`.env.example` addition:**

```env
# Mistral AI (EU-based, GDPR-compliant)
# MISTRAL_API_KEY=your-mistral-api-key
# MISTRAL_MODEL=mistral-small-latest
# MISTRAL_OCR_MODEL=mistral-ocr-latest
```

---

## 7. Testing Strategy

The project uses **Vitest** (`vitest` in package.json scripts). No existing test files were found in the project (only node_modules), so we establish the pattern.

### 7.1 New Test Files

#### `__tests__/adapters/mistral.adapter.test.ts`

- Mock `axios.post` for OCR and Chat endpoints
- Test `extractTextWithOcr()` — valid response, empty response, timeout, error handling
- Test `extractInvoiceData()` — full two-step pipeline
- Test `extractWithText()` — skips OCR when text provided
- Test `extractWithRetry()` — retry with correction prompt
- Test `sendPrompt()` — boundary detection flow
- Test `validateConfiguration()` — with/without API key
- Test throttle integration (mock `mistralThrottle.acquire()`)

#### `__tests__/services/ai/mistral.extractor.test.ts`

- Mock `IMistralAdapter`
- Test `extractFromFile()` — happy path with Mistral OCR → Chat
- Test fallback to local text extraction when OCR fails
- Test validation + retry loop
- Test confidence degradation on persistent errors

#### `__tests__/lib/extraction-normalizer.mistral.test.ts`

- Test `taxRate` as array `[19, 7]` → normalized to `null`
- Test `taxRate` as array on line items → normalized to `null`
- Ensure existing non-array behavior unchanged

#### `__tests__/services/ai/extractor.factory.test.ts`

- Test `create('mistral')` returns `MistralExtractor`
- Test `getAvailableProviders()` includes `'mistral'`
- Test `create('mistral')` throws when `MISTRAL_API_KEY` not set

### 7.2 Test Utilities

Create `__tests__/fixtures/mistral-ocr-response.json` and `__tests__/fixtures/mistral-chat-response.json` with sample responses for consistent testing.

---

## 8. Risk Assessment

| Risk                                                | Severity | Likelihood | Mitigation                                                                                                                           |
| --------------------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Mistral OCR API format differs from assumed**     | High     | Medium     | Verify against API docs before coding. Abstract OCR response parsing into a separate method for easy updates.                        |
| **`data:` URI not supported by OCR endpoint**       | High     | Medium     | Implement fallback: upload via `/v1/files`, then pass file ID.                                                                       |
| **Two API calls = 2× latency**                      | Medium   | High       | Expected and acceptable. OCR is fast (~2-5s), chat ~5-15s. Total ~10-20s vs 5-15s for single-call providers. Monitor and log timing. |
| **Two API calls = 2× cost**                         | Medium   | High       | Expected. Mistral pricing is lower than OpenAI. Document cost comparison.                                                            |
| **Mistral JSON output less structured than OpenAI** | Medium   | Medium     | No `json_schema` support — use `json_object` mode + `parseJsonFromAiResponse()`. The existing normalizer handles messy data well.    |
| **taxRate array fix affects other providers**       | Low      | Low        | Guard is `Array.isArray()` check — no-op for non-array values.                                                                       |
| **Rate limit misconfiguration**                     | Low      | Medium     | Start conservative (1/sec). Log 429 errors. Easy to adjust constants.                                                                |
| **Breaking existing providers**                     | Critical | Very Low   | All changes are additive. No modifications to existing adapter/extractor code. Factory switch-case only adds a new case.             |

---

## 9. Rollback Strategy

### Immediate Rollback (< 1 minute)

Set `AI_PROVIDER` to any other value (`gemini`, `openai`, `deepseek`). Mistral code is never loaded unless selected.

### Code Rollback

All changes are isolated to:

- 3 new files (delete them)
- 6 existing files with additive-only changes (revert additions)

No database migrations. No schema changes. No breaking changes to existing interfaces.

### Feature Flag

`ENABLE_MISTRAL_OCR` can disable the OCR integration point in `text-extraction.ts` independently.

---

## 10. Implementation Order

**Phase 1: Core (estimate: 2-3 hours)**

1. `adapters/interfaces/IMistralAdapter.ts` — interface
2. `lib/constants.ts` — add constants
3. `lib/api-throttle.ts` — add throttle
4. `adapters/mistral.adapter.ts` — adapter implementation
5. `adapters/index.ts` + `adapters/interfaces/index.ts` — exports

**Phase 2: Integration (estimate: 1-2 hours)** 6. `services/ai/mistral.extractor.ts` — extractor 7. `services/ai/extractor.factory.ts` — register in factory 8. `services/boundary-detection.service.ts` — add Mistral support 9. `lib/extraction-normalizer.ts` — taxRate array fix

**Phase 3: Optional Enhancements (estimate: 1 hour)** 10. `lib/text-extraction.ts` — Mistral OCR as text source (optional, defer if not needed)

**Phase 4: Testing (estimate: 2-3 hours)** 11. Write all test files 12. Manual E2E test with real Mistral API key

**Phase 5: Documentation** 13. Update `.env.example` 14. Update README with Mistral setup instructions

**Total estimate: 6-9 hours**

---

## Appendix: File Change Summary

| File                                     | Action                                     | Breaking? |
| ---------------------------------------- | ------------------------------------------ | --------- |
| `adapters/interfaces/IMistralAdapter.ts` | **CREATE**                                 | No        |
| `adapters/mistral.adapter.ts`            | **CREATE**                                 | No        |
| `services/ai/mistral.extractor.ts`       | **CREATE**                                 | No        |
| `lib/constants.ts`                       | ADD 3 constants                            | No        |
| `lib/api-throttle.ts`                    | ADD 1 import + 1 singleton                 | No        |
| `lib/extraction-normalizer.ts`           | ADD Array.isArray guard (2 locations)      | No        |
| `lib/text-extraction.ts`                 | ADD Mistral OCR route + extend source type | No        |
| `adapters/index.ts`                      | ADD 1 export line                          | No        |
| `adapters/interfaces/index.ts`           | ADD 1 export line                          | No        |
| `services/ai/extractor.factory.ts`       | ADD import + case + type union member      | No        |
| `services/boundary-detection.service.ts` | ADD import + else-if branch                | No        |
