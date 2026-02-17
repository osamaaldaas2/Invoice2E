/**
 * @module lib/saga/types
 * @description Type definitions for the saga orchestrator pattern.
 *
 * Intent: Define strict contracts for saga steps, context, results, and
 * status used by the orchestrator to manage the extraction→conversion pipeline
 * with automatic compensation on failure.
 */

import type { ValidFormat } from '@/lib/state-machine/types';

// ─── Saga Status ────────────────────────────────────────────────────────────

/** Possible states of a saga execution. */
export type SagaStatus = 'running' | 'completed' | 'compensating' | 'failed';

// ─── Saga Context ───────────────────────────────────────────────────────────

/** Mutable context passed through every saga step. */
export interface SagaContext {
  /** Invoice being processed. */
  invoiceId: string;
  /** Owner of the invoice. */
  userId: string;
  /** Extraction ID produced by the extract step. */
  extractionId?: string;
  /** Conversion ID produced by the convert step. */
  conversionId?: string;
  /** Desired output format (zugferd, xrechnung, facturx). */
  format?: ValidFormat | string;
  /** Error captured on failure. */
  error?: string;
}

// ─── Saga Step ──────────────────────────────────────────────────────────────

/**
 * A single step in a saga.
 *
 * `execute` performs the forward action and may mutate the context.
 * `compensate` undoes the forward action during rollback.
 */
export interface SagaStep {
  /** Human-readable step name for logging. */
  name: string;
  /** Forward action. Receives and may mutate the shared context. */
  execute: (context: SagaContext) => Promise<void>;
  /** Compensation action run on rollback. Must be idempotent. */
  compensate: (context: SagaContext) => Promise<void>;
}

// ─── Saga Result ────────────────────────────────────────────────────────────

/** Outcome returned after a saga execution completes or fails. */
export interface SagaResult {
  /** Whether all steps completed successfully. */
  success: boolean;
  /** Names of steps that executed successfully. */
  completedSteps: string[];
  /** Name of the step that failed, if any. */
  failedStep?: string;
  /** Names of steps that were compensated during rollback. */
  compensatedSteps: string[];
}

// ─── Saga Log Entry ─────────────────────────────────────────────────────────

/** A single log entry written during saga execution. */
export interface SagaLogEntry {
  /** Saga execution identifier. */
  sagaId: string;
  /** Step name this entry relates to. */
  stepName: string;
  /** What happened: execute, compensate, or error. */
  action: 'execute' | 'compensate' | 'error';
  /** Whether the action succeeded. */
  success: boolean;
  /** Optional error message. */
  error?: string;
  /** ISO-8601 timestamp. */
  timestamp: string;
}

// ─── Saga Execution Record (DB) ─────────────────────────────────────────────

/** Row shape for the saga_executions table. */
export interface SagaExecutionRecord {
  id: string;
  invoice_id: string;
  user_id: string;
  status: SagaStatus;
  steps_completed: string[];
  steps_compensated: string[];
  failed_step: string | null;
  error: string | null;
  context_snapshot: SagaContext;
  started_at: string;
  completed_at: string | null;
}
