/**
 * @module lib/saga/orchestrator
 * @description Saga orchestrator that executes ordered steps with automatic
 * reverse-order compensation on failure.
 *
 * Intent: Provide a reliable, observable pipeline for multi-step invoice
 * processing. Each step is logged, and failures trigger compensating
 * actions in reverse order to maintain data consistency.
 */

import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
import type {
  SagaStep,
  SagaContext,
  SagaResult,
  SagaLogEntry,
  SagaStatus,
} from './types';

/** Timeout for individual saga step execution (ms). */
const STEP_TIMEOUT_MS = 30_000;

/**
 * Wraps a promise with a timeout.
 *
 * @param promise - The promise to wrap.
 * @param timeoutMs - Maximum time in milliseconds.
 * @param label - Label for the timeout error message.
 * @returns The resolved value of the promise.
 * @throws Error if the promise does not resolve within the timeout.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Saga step "${label}" timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Callback for persisting saga log entries (e.g. to saga_log table).
 * Injected to keep the orchestrator free of direct DB dependencies.
 */
export type SagaLogWriter = (entry: SagaLogEntry) => Promise<void>;

/**
 * Callback for persisting/updating saga execution state.
 * Injected to keep the orchestrator free of direct DB dependencies.
 */
export interface SagaExecutionStore {
  /** Create a new execution record, returning its ID. */
  create: (params: {
    invoiceId: string;
    userId: string;
    status: SagaStatus;
  }) => Promise<string>;
  /** Update an existing execution record. */
  update: (params: {
    sagaId: string;
    status: SagaStatus;
    stepsCompleted: string[];
    stepsCompensated: string[];
    failedStep: string | null;
    error: string | null;
    contextSnapshot: SagaContext;
  }) => Promise<void>;
}

/** Configuration for the SagaOrchestrator. */
export interface SagaOrchestratorConfig {
  /** Optional custom timeout per step (ms). Defaults to 30 000. */
  stepTimeoutMs?: number;
  /** Optional log writer for saga_log entries. */
  logWriter?: SagaLogWriter;
  /** Optional execution store for saga_executions persistence. */
  executionStore?: SagaExecutionStore;
}

/**
 * Orchestrates a sequence of saga steps with compensation on failure.
 *
 * ### Usage
 * ```ts
 * const orchestrator = new SagaOrchestrator({ logWriter, executionStore });
 * orchestrator.define([step1, step2, step3]);
 * const result = await orchestrator.execute({ invoiceId: '...', userId: '...' });
 * ```
 */
export class SagaOrchestrator {
  private steps: SagaStep[] = [];
  private readonly stepTimeoutMs: number;
  private readonly logWriter: SagaLogWriter | undefined;
  private readonly executionStore: SagaExecutionStore | undefined;

  constructor(config: SagaOrchestratorConfig = {}) {
    this.stepTimeoutMs = config.stepTimeoutMs ?? STEP_TIMEOUT_MS;
    this.logWriter = config.logWriter;
    this.executionStore = config.executionStore;
  }

  /**
   * Define the ordered steps for this saga.
   *
   * @param steps - Array of saga steps executed in order.
   * @returns `this` for chaining.
   */
  define(steps: SagaStep[]): this {
    if (steps.length === 0) {
      throw new Error('Saga must have at least one step');
    }
    this.steps = [...steps];
    return this;
  }

  /**
   * Execute the saga: run each step in order; on failure compensate
   * completed steps in reverse order.
   *
   * @param context - Initial saga context.
   * @returns A {@link SagaResult} describing what happened.
   */
  async execute(context: SagaContext): Promise<SagaResult> {
    if (this.steps.length === 0) {
      throw new Error('No steps defined — call define() before execute()');
    }

    const sagaId = randomUUID();
    const completedSteps: string[] = [];
    const compensatedSteps: string[] = [];

    // Persist initial execution record
    if (this.executionStore) {
      try {
        await this.executionStore.create({
          invoiceId: context.invoiceId,
          userId: context.userId,
          status: 'running',
        });
      } catch (storeErr: unknown) {
        logger.error('Failed to create saga execution record', {
          sagaId,
          error: storeErr instanceof Error ? storeErr.message : String(storeErr),
        });
      }
    }

    logger.info('Saga execution started', {
      sagaId,
      invoiceId: context.invoiceId,
      stepCount: this.steps.length,
    });

    // ── Forward execution ───────────────────────────────────────────
    for (const step of this.steps) {
      try {
        await withTimeout(step.execute(context), this.stepTimeoutMs, step.name);
        completedSteps.push(step.name);

        await this.writeLog({ sagaId, stepName: step.name, action: 'execute', success: true });

        logger.info('Saga step completed', { sagaId, step: step.name });
      } catch (execErr: unknown) {
        const errorMessage = execErr instanceof Error ? execErr.message : String(execErr);
        context.error = errorMessage;

        await this.writeLog({
          sagaId,
          stepName: step.name,
          action: 'error',
          success: false,
          error: errorMessage,
        });

        logger.error('Saga step failed — starting compensation', {
          sagaId,
          failedStep: step.name,
          error: errorMessage,
        });

        // ── Compensation (reverse order) ────────────────────────────
        await this.updateExecution(sagaId, 'compensating', completedSteps, compensatedSteps, step.name, errorMessage, context);

        const stepsToCompensate = [...completedSteps].reverse();
        for (const completedName of stepsToCompensate) {
          const completedStep = this.steps.find((s) => s.name === completedName);
          if (!completedStep) continue;

          try {
            await withTimeout(completedStep.compensate(context), this.stepTimeoutMs, `${completedStep.name}:compensate`);
            compensatedSteps.push(completedStep.name);

            await this.writeLog({ sagaId, stepName: completedStep.name, action: 'compensate', success: true });

            logger.info('Saga compensation completed', { sagaId, step: completedStep.name });
          } catch (compErr: unknown) {
            const compError = compErr instanceof Error ? compErr.message : String(compErr);

            await this.writeLog({
              sagaId,
              stepName: completedStep.name,
              action: 'compensate',
              success: false,
              error: compError,
            });

            logger.error('Saga compensation failed', {
              sagaId,
              step: completedStep.name,
              error: compError,
            });
            // Continue compensating remaining steps even if one fails
          }
        }

        const result: SagaResult = {
          success: false,
          completedSteps,
          failedStep: step.name,
          compensatedSteps,
        };

        await this.updateExecution(sagaId, 'failed', completedSteps, compensatedSteps, step.name, errorMessage, context);

        logger.info('Saga execution failed', { sagaId, result });
        return result;
      }
    }

    // ── Success ─────────────────────────────────────────────────────
    const result: SagaResult = {
      success: true,
      completedSteps,
      compensatedSteps: [],
    };

    await this.updateExecution(sagaId, 'completed', completedSteps, [], null, null, context);

    logger.info('Saga execution completed', { sagaId, result });
    return result;
  }

  /**
   * Write a log entry via the injected writer, swallowing errors.
   */
  private async writeLog(
    params: Omit<SagaLogEntry, 'timestamp'>,
  ): Promise<void> {
    if (!this.logWriter) return;
    try {
      await this.logWriter({ ...params, timestamp: new Date().toISOString() });
    } catch (err: unknown) {
      logger.error('Failed to write saga log', {
        sagaId: params.sagaId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Update the execution record via the injected store, swallowing errors.
   */
  private async updateExecution(
    sagaId: string,
    status: SagaStatus,
    stepsCompleted: string[],
    stepsCompensated: string[],
    failedStep: string | null,
    error: string | null,
    context: SagaContext,
  ): Promise<void> {
    if (!this.executionStore) return;
    try {
      await this.executionStore.update({
        sagaId,
        status,
        stepsCompleted,
        stepsCompensated,
        failedStep,
        error,
        contextSnapshot: context,
      });
    } catch (storeErr: unknown) {
      logger.error('Failed to update saga execution', {
        sagaId,
        error: storeErr instanceof Error ? storeErr.message : String(storeErr),
      });
    }
  }
}
