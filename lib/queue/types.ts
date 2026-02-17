/**
 * BullMQ Job Payload & Result Types
 *
 * Zod schemas for all job payloads, result types, and queue event types.
 * Single source of truth for job data contracts.
 *
 * @module lib/queue/types
 */

import { z } from 'zod';
import type { OutputFormat } from '@/types/canonical-invoice';

// ─── Queue Names ────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  EXTRACTION: 'invoice:extraction',
  CONVERSION: 'invoice:conversion',
  BATCH: 'invoice:batch',
  EMAIL: 'invoice:email',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ─── Extraction Job ─────────────────────────────────────────────────────────

export const ExtractionJobPayloadSchema = z.object({
  fileId: z.string().uuid(),
  userId: z.string().uuid(),
  options: z
    .object({
      language: z.string().optional(),
      ocrEnabled: z.boolean().optional(),
      outputFormat: z.string().optional(),
    })
    .optional(),
});

export type ExtractionJobPayload = z.infer<typeof ExtractionJobPayloadSchema>;

export interface ExtractionJobResult {
  extractionId: string;
  confidenceScore: number | null;
  processingTimeMs: number;
}

// ─── Conversion Job ─────────────────────────────────────────────────────────

export const ConversionJobPayloadSchema = z.object({
  extractionId: z.string().uuid(),
  userId: z.string().uuid(),
  outputFormat: z.custom<OutputFormat>((val) => typeof val === 'string' && val.length > 0, {
    message: 'outputFormat must be a non-empty string',
  }),
});

export type ConversionJobPayload = z.infer<typeof ConversionJobPayloadSchema>;

export interface ConversionJobResult {
  conversionId: string;
  format: string;
  validationStatus: string;
  processingTimeMs: number;
}

// ─── Batch Job ──────────────────────────────────────────────────────────────

export const BatchJobPayloadSchema = z.object({
  batchId: z.string().uuid(),
  userId: z.string().uuid(),
  fileIds: z.array(z.string().uuid()).min(1).max(100),
  options: z
    .object({
      outputFormat: z.string().optional(),
      language: z.string().optional(),
      ocrEnabled: z.boolean().optional(),
    })
    .optional(),
});

export type BatchJobPayload = z.infer<typeof BatchJobPayloadSchema>;

export interface BatchJobResult {
  batchId: string;
  totalFiles: number;
  successCount: number;
  failureCount: number;
  extractionIds: string[];
  processingTimeMs: number;
}

// ─── Email Job ──────────────────────────────────────────────────────────────

export const EmailJobPayloadSchema = z.object({
  userId: z.string().uuid(),
  conversionId: z.string().uuid(),
  recipientEmail: z.string().email(),
  subject: z.string().min(1).max(500),
  attachmentUrl: z.string().url().optional(),
});

export type EmailJobPayload = z.infer<typeof EmailJobPayloadSchema>;

export interface EmailJobResult {
  messageId: string;
  sentAt: string;
}

// ─── Job Status (for API responses) ─────────────────────────────────────────

export interface JobStatusResponse {
  jobId: string;
  queueName: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown';
  progress: number;
  result?: unknown;
  error?: string;
  failedReason?: string;
  attemptsMade: number;
  createdAt: number | undefined;
  finishedAt: number | undefined;
}

// ─── Dead Letter Entry ──────────────────────────────────────────────────────

export interface DeadLetterEntry {
  jobId: string;
  queueName: string;
  payload: unknown;
  failedReason: string;
  attemptsMade: number;
  failedAt: string;
  stackTrace?: string[];
}
