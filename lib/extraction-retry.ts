/**
 * Phase 4: Retry Logic
 * Builds retry prompt from extracted text + validation errors.
 */

import type { ExtractionValidationError } from '@/lib/extraction-validator';
import { EXTRACTION_MAX_RETRIES } from '@/lib/constants';

export interface RetryContext {
  originalJson: string;
  validationErrors: ExtractionValidationError[];
  extractedText?: string;
  attempt: number;
}

export function shouldRetry(attempt: number): boolean {
  return attempt < EXTRACTION_MAX_RETRIES;
}

export function buildRetryPrompt(ctx: RetryContext): string {
  const errorLines = ctx.validationErrors
    .map((e) => {
      let line = `- ${e.field}: ${e.message}`;
      if (e.expected !== undefined) line += ` (expected: ${e.expected}, got: ${e.actual})`;
      return line;
    })
    .join('\n');

  let prompt = `Your previous extraction had mathematical/validation errors. Fix them.

ERRORS FOUND:
${errorLines}

YOUR PREVIOUS JSON:
${ctx.originalJson}
`;

  if (ctx.extractedText) {
    // Include a truncated version of extracted text for cross-reference
    const truncated =
      ctx.extractedText.length > 3000
        ? ctx.extractedText.substring(0, 3000) + '\n[... truncated]'
        : ctx.extractedText;
    prompt += `\nEXTRACTED TEXT FROM PDF (for cross-reference):
${truncated}
`;
  }

  prompt += `\nFix the errors above and return the corrected JSON. Return ONLY valid JSON, no explanations.`;

  return prompt;
}
