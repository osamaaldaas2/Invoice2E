/**
 * Tests for the Awilix DI container.
 *
 * Verifies:
 * - All registered services resolve without error.
 * - No circular dependency issues.
 * - Singleton services return the same instance across resolves.
 * - Container disposes cleanly.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createAppContainer, disposeContainer } from './container';
import type { Cradle, TypedContainer } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** All registered service keys */
const ALL_KEYS: (keyof Cradle)[] = [
  'geminiAdapter',
  'openaiAdapter',
  'mistralAdapter',
  'extractorFactory',
  'invoiceDbService',
  'auditDbService',
  'creditsDbService',
  'geminiCircuitBreaker',
  'openaiCircuitBreaker',
  'mistralCircuitBreaker',
  'logger',
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DI Container', () => {
  let container: TypedContainer;

  afterEach(async () => {
    await disposeContainer();
  });

  it('creates a container without throwing', () => {
    expect(() => {
      container = createAppContainer();
    }).not.toThrow();
  });

  it('resolves every registered service', () => {
    container = createAppContainer();

    for (const key of ALL_KEYS) {
      const resolved = container.resolve(key);
      expect(resolved).toBeDefined();
    }
  });

  it('returns the same instance for SINGLETON services', () => {
    container = createAppContainer();

    const logger1 = container.resolve('logger');
    const logger2 = container.resolve('logger');
    expect(logger1).toBe(logger2);

    const cb1 = container.resolve('geminiCircuitBreaker');
    const cb2 = container.resolve('geminiCircuitBreaker');
    expect(cb1).toBe(cb2);

    const adapter1 = container.resolve('geminiAdapter');
    const adapter2 = container.resolve('geminiAdapter');
    expect(adapter1).toBe(adapter2);
  });

  it('resolves scoped services in a child scope', () => {
    container = createAppContainer();
    const scope = container.createScope();

    const invoiceDb = scope.resolve('invoiceDbService');
    expect(invoiceDb).toBeDefined();

    const auditDb = scope.resolve('auditDbService');
    expect(auditDb).toBeDefined();

    const creditsDb = scope.resolve('creditsDbService');
    expect(creditsDb).toBeDefined();
  });

  it('provides distinct scoped instances per scope', () => {
    container = createAppContainer();
    const scope1 = container.createScope();
    const scope2 = container.createScope();

    const db1 = scope1.resolve('invoiceDbService');
    const db2 = scope2.resolve('invoiceDbService');

    // Scoped services should be distinct across different scopes
    expect(db1).not.toBe(db2);
  });

  it('has no circular dependencies (all keys resolve in fresh container)', () => {
    // If circular deps exist, Awilix throws during resolution
    container = createAppContainer();

    expect(() => {
      for (const key of ALL_KEYS) {
        container.resolve(key);
      }
    }).not.toThrow();
  });

  it('disposes without error', async () => {
    container = createAppContainer();
    // resolve something to ensure container is active
    container.resolve('logger');

    await expect(disposeContainer()).resolves.toBeUndefined();
  });
});
