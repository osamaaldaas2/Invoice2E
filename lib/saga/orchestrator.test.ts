/**
 * @module lib/saga/orchestrator.test
 * @description Tests for the SagaOrchestrator: happy path, failure with
 * reverse compensation, and partial compensation on double failure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SagaOrchestrator } from './orchestrator';
import type { SagaStep, SagaContext } from './types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<SagaContext> = {}): SagaContext {
  return {
    invoiceId: 'inv-001',
    userId: 'user-001',
    format: 'zugferd',
    ...overrides,
  };
}

function makeStep(name: string, options?: {
  executeFail?: boolean;
  compensateFail?: boolean;
}): SagaStep & { executeSpy: ReturnType<typeof vi.fn>; compensateSpy: ReturnType<typeof vi.fn> } {
  const executeSpy = vi.fn<(ctx: SagaContext) => Promise<void>>().mockImplementation(async () => {
    if (options?.executeFail) {
      throw new Error(`${name} execute failed`);
    }
  });
  const compensateSpy = vi.fn<(ctx: SagaContext) => Promise<void>>().mockImplementation(async () => {
    if (options?.compensateFail) {
      throw new Error(`${name} compensate failed`);
    }
  });

  return {
    name,
    execute: executeSpy,
    compensate: compensateSpy,
    executeSpy,
    compensateSpy,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SagaOrchestrator', () => {
  let orchestrator: SagaOrchestrator;

  beforeEach(() => {
    orchestrator = new SagaOrchestrator();
  });

  it('should throw when executing with no steps defined', async () => {
    await expect(orchestrator.execute(makeContext())).rejects.toThrow(
      'No steps defined',
    );
  });

  it('should throw when defining empty steps array', () => {
    expect(() => orchestrator.define([])).toThrow('at least one step');
  });

  // ── Happy path ──────────────────────────────────────────────────────

  describe('happy path', () => {
    it('should complete all steps and return success', async () => {
      const step1 = makeStep('validate');
      const step2 = makeStep('deduct');
      const step3 = makeStep('extract');

      orchestrator.define([step1, step2, step3]);
      const result = await orchestrator.execute(makeContext());

      expect(result.success).toBe(true);
      expect(result.completedSteps).toEqual(['validate', 'deduct', 'extract']);
      expect(result.failedStep).toBeUndefined();
      expect(result.compensatedSteps).toEqual([]);

      expect(step1.executeSpy).toHaveBeenCalledOnce();
      expect(step2.executeSpy).toHaveBeenCalledOnce();
      expect(step3.executeSpy).toHaveBeenCalledOnce();

      // No compensation on success
      expect(step1.compensateSpy).not.toHaveBeenCalled();
      expect(step2.compensateSpy).not.toHaveBeenCalled();
      expect(step3.compensateSpy).not.toHaveBeenCalled();
    });

    it('should pass shared context through all steps', async () => {
      const step1: SagaStep = {
        name: 'setExtraction',
        execute: async (ctx) => { ctx.extractionId = 'ext-123'; },
        compensate: async () => {},
      };
      const step2: SagaStep = {
        name: 'checkExtraction',
        execute: async (ctx) => {
          if (ctx.extractionId !== 'ext-123') {
            throw new Error('Context not shared');
          }
        },
        compensate: async () => {},
      };

      orchestrator.define([step1, step2]);
      const result = await orchestrator.execute(makeContext());

      expect(result.success).toBe(true);
    });
  });

  // ── Failure triggers compensation in reverse ────────────────────────

  describe('failure with compensation', () => {
    it('should compensate completed steps in reverse order on failure', async () => {
      const compensationOrder: string[] = [];

      const step1 = makeStep('validate');
      step1.compensateSpy.mockImplementation(async () => {
        compensationOrder.push('validate');
      });

      const step2 = makeStep('deduct');
      step2.compensateSpy.mockImplementation(async () => {
        compensationOrder.push('deduct');
      });

      const step3 = makeStep('extract', { executeFail: true });

      orchestrator.define([step1, step2, step3]);
      const result = await orchestrator.execute(makeContext());

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe('extract');
      expect(result.completedSteps).toEqual(['validate', 'deduct']);
      expect(result.compensatedSteps).toEqual(['deduct', 'validate']);

      // Verify reverse order
      expect(compensationOrder).toEqual(['deduct', 'validate']);

      // Failed step was never compensated (it never completed)
      expect(step3.compensateSpy).not.toHaveBeenCalled();
    });

    it('should set error on context when a step fails', async () => {
      let capturedError: string | undefined;

      const step1: SagaStep = {
        name: 'validate',
        execute: async () => {},
        compensate: async (ctx) => { capturedError = ctx.error; },
      };
      const step2: SagaStep = {
        name: 'failStep',
        execute: async () => { throw new Error('boom'); },
        compensate: async () => {},
      };

      orchestrator.define([step1, step2]);
      const result = await orchestrator.execute(makeContext());

      expect(result.success).toBe(false);
      expect(capturedError).toBe('boom');
    });

    it('should not compensate any steps when the first step fails', async () => {
      const step1 = makeStep('validate', { executeFail: true });
      const step2 = makeStep('deduct');

      orchestrator.define([step1, step2]);
      const result = await orchestrator.execute(makeContext());

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe('validate');
      expect(result.completedSteps).toEqual([]);
      expect(result.compensatedSteps).toEqual([]);
      expect(step2.executeSpy).not.toHaveBeenCalled();
    });
  });

  // ── Partial compensation on double failure ──────────────────────────

  describe('partial compensation on double failure', () => {
    it('should continue compensating remaining steps even if one compensation fails', async () => {
      const compensationOrder: string[] = [];

      const step1 = makeStep('validate');
      step1.compensateSpy.mockImplementation(async () => {
        compensationOrder.push('validate');
      });

      const step2 = makeStep('deduct', { compensateFail: true });

      const step3 = makeStep('extract');
      step3.compensateSpy.mockImplementation(async () => {
        compensationOrder.push('extract');
      });

      const step4 = makeStep('convert', { executeFail: true });

      orchestrator.define([step1, step2, step3, step4]);
      const result = await orchestrator.execute(makeContext());

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe('convert');
      expect(result.completedSteps).toEqual(['validate', 'deduct', 'extract']);

      // step2 (deduct) compensation failed, but step3 and step1 succeeded
      expect(result.compensatedSteps).toEqual(['extract', 'validate']);
      expect(compensationOrder).toEqual(['extract', 'validate']);
    });
  });

  // ── Log writer integration ──────────────────────────────────────────

  describe('log writer', () => {
    it('should call log writer for each step execution', async () => {
      const logWriter = vi.fn().mockResolvedValue(undefined);
      const orch = new SagaOrchestrator({ logWriter });

      const step1 = makeStep('validate');
      const step2 = makeStep('deduct');

      orch.define([step1, step2]);
      await orch.execute(makeContext());

      expect(logWriter).toHaveBeenCalledTimes(2);
      expect(logWriter).toHaveBeenCalledWith(
        expect.objectContaining({ stepName: 'validate', action: 'execute', success: true }),
      );
      expect(logWriter).toHaveBeenCalledWith(
        expect.objectContaining({ stepName: 'deduct', action: 'execute', success: true }),
      );
    });
  });
});
