/**
 * @module lib/saga/invoice-saga
 * @description Predefined saga for the invoice extraction→conversion pipeline.
 *
 * Intent: Wire up the five-step invoice conversion saga with concrete
 * execute/compensate implementations that delegate to injected service
 * dependencies, keeping the saga definition testable and free of hard-coded
 * infrastructure.
 */

import { logger } from '@/lib/logger';
import type { SagaStep, SagaContext } from './types';
import { SagaOrchestrator } from './orchestrator';
import type { SagaOrchestratorConfig } from './orchestrator';

// ─── Dependency Contracts ───────────────────────────────────────────────────

/** External services required by the invoice conversion saga. */
export interface InvoiceSagaDeps {
  /** Validate that the invoice and format are valid for processing. */
  validateInput: (context: SagaContext) => Promise<void>;
  /** Deduct credits from the user's balance. Returns the transaction ID. */
  deductCredits: (userId: string, invoiceId: string) => Promise<string>;
  /** Refund credits for a failed conversion. */
  refundCredits: (userId: string, invoiceId: string) => Promise<void>;
  /** Run AI extraction on the invoice. Returns the extraction ID. */
  extractInvoice: (invoiceId: string, userId: string) => Promise<string>;
  /** Delete an extraction result (compensation). */
  deleteExtraction: (extractionId: string) => Promise<void>;
  /** Convert extracted data to the target format. Returns the conversion ID. */
  convertToFormat: (extractionId: string, userId: string, format: string) => Promise<string>;
  /** Delete a conversion result (compensation). */
  deleteConversion: (conversionId: string) => Promise<void>;
  /** Notify the user of completion. */
  notifyUser: (userId: string, invoiceId: string, conversionId: string) => Promise<void>;
}

/**
 * Build the ordered saga steps for invoice conversion.
 *
 * @param deps - Injected service dependencies.
 * @returns Array of {@link SagaStep} in execution order.
 */
export function buildInvoiceConversionSteps(deps: InvoiceSagaDeps): SagaStep[] {
  return [
    // Step 1: Validate input
    {
      name: 'validateInput',
      execute: async (ctx: SagaContext): Promise<void> => {
        await deps.validateInput(ctx);
        logger.info('Saga: input validated', { invoiceId: ctx.invoiceId });
      },
      compensate: async (_ctx: SagaContext): Promise<void> => {
        // No-op — validation has no side effects to undo.
      },
    },

    // Step 2: Deduct credits
    {
      name: 'deductCredits',
      execute: async (ctx: SagaContext): Promise<void> => {
        await deps.deductCredits(ctx.userId, ctx.invoiceId);
        logger.info('Saga: credits deducted', { userId: ctx.userId, invoiceId: ctx.invoiceId });
      },
      compensate: async (ctx: SagaContext): Promise<void> => {
        await deps.refundCredits(ctx.userId, ctx.invoiceId);
        logger.info('Saga: credits refunded', { userId: ctx.userId, invoiceId: ctx.invoiceId });
      },
    },

    // Step 3: Extract invoice data
    {
      name: 'extractInvoice',
      execute: async (ctx: SagaContext): Promise<void> => {
        const extractionId = await deps.extractInvoice(ctx.invoiceId, ctx.userId);
        ctx.extractionId = extractionId;
        logger.info('Saga: invoice extracted', { invoiceId: ctx.invoiceId, extractionId });
      },
      compensate: async (ctx: SagaContext): Promise<void> => {
        if (ctx.extractionId) {
          await deps.deleteExtraction(ctx.extractionId);
          logger.info('Saga: extraction deleted', { extractionId: ctx.extractionId });
        }
      },
    },

    // Step 4: Convert to target format
    {
      name: 'convertToFormat',
      execute: async (ctx: SagaContext): Promise<void> => {
        if (!ctx.extractionId) {
          throw new Error('Cannot convert: extractionId is missing from context');
        }
        if (!ctx.format) {
          throw new Error('Cannot convert: format is missing from context');
        }
        const conversionId = await deps.convertToFormat(ctx.extractionId, ctx.userId, ctx.format);
        ctx.conversionId = conversionId;
        logger.info('Saga: invoice converted', { extractionId: ctx.extractionId, conversionId, format: ctx.format });
      },
      compensate: async (ctx: SagaContext): Promise<void> => {
        if (ctx.conversionId) {
          await deps.deleteConversion(ctx.conversionId);
          logger.info('Saga: conversion deleted', { conversionId: ctx.conversionId });
        }
      },
    },

    // Step 5: Notify user
    {
      name: 'notifyUser',
      execute: async (ctx: SagaContext): Promise<void> => {
        await deps.notifyUser(ctx.userId, ctx.invoiceId, ctx.conversionId ?? '');
        logger.info('Saga: user notified', { userId: ctx.userId, invoiceId: ctx.invoiceId });
      },
      compensate: async (_ctx: SagaContext): Promise<void> => {
        // No-op — notifications cannot be meaningfully undone.
      },
    },
  ];
}

/**
 * Create a fully configured saga orchestrator for invoice conversion.
 *
 * @param deps - Injected service dependencies.
 * @param config - Optional orchestrator configuration (log writer, store, timeout).
 * @returns A ready-to-execute {@link SagaOrchestrator}.
 */
export function createInvoiceConversionSaga(
  deps: InvoiceSagaDeps,
  config?: SagaOrchestratorConfig,
): SagaOrchestrator {
  const steps = buildInvoiceConversionSteps(deps);
  const orchestrator = new SagaOrchestrator(config);
  orchestrator.define(steps);
  return orchestrator;
}
