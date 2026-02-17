/**
 * Awilix dependency injection container — single source of truth for service wiring.
 *
 * Intent: Centralise service instantiation so that dependencies are explicit,
 * testable, and swappable without scattering `new Foo()` calls across the codebase.
 *
 * Lifetime strategy:
 * - SINGLETON — stateful services that must share state across requests
 *   (circuit breakers, logger).
 * - SCOPED    — request-scoped services that may hold per-request context
 *   (DB services, factories).
 * - TRANSIENT — (reserved for future use) fresh instance every resolve.
 */

import {
  createContainer,
  asClass,
  asValue,
  asFunction,
  InjectionMode,
  Lifetime,
} from 'awilix';
import type { TypedContainer } from './types';

// ── Adapters ─────────────────────────────────────────────────────────────────
import { GeminiAdapter } from '@/adapters/gemini.adapter';
import { OpenAIAdapter } from '@/adapters/openai.adapter';
import { MistralAdapter } from '@/adapters/mistral.adapter';

// ── Services ─────────────────────────────────────────────────────────────────
import { ExtractorFactory } from '@/services/ai/extractor.factory';
import { InvoiceDatabaseService } from '@/services/invoice.db.service';
import { AuditDatabaseService } from '@/services/audit.db.service';
import { CreditsDatabaseService } from '@/services/credits.db.service';

// ── Infrastructure ───────────────────────────────────────────────────────────
import { CircuitBreaker } from '@/lib/circuit-breaker';
import { logger } from '@/lib/logger';

// ─── Container Creation ──────────────────────────────────────────────────────

/**
 * Build and return a fully-wired Awilix container.
 *
 * Call once at application bootstrap; pass the returned container (or a
 * scoped child) into request handlers.
 *
 * @returns Configured `AwilixContainer` with all services registered.
 */
export function createAppContainer(): TypedContainer {
  const container = createContainer<any>({
    injectionMode: InjectionMode.CLASSIC,
    strict: true,
  });

  // ── Config (value bag consumed by adapters via CLASSIC injection) ───────
  container.register({
    config: asValue(undefined),
  });

  // ── Adapters (SINGLETON — hold SDK clients / connection state) ─────────
  container.register({
    geminiAdapter: asClass(GeminiAdapter, { lifetime: Lifetime.SINGLETON }),
    openaiAdapter: asClass(OpenAIAdapter, { lifetime: Lifetime.SINGLETON }),
    mistralAdapter: asClass(MistralAdapter, { lifetime: Lifetime.SINGLETON }),
  });

  // ── Factories (SCOPED — one per request boundary) ──────────────────────
  container.register({
    extractorFactory: asValue(ExtractorFactory),
  });

  // ── Database services (SCOPED — per-request Supabase clients) ──────────
  container.register({
    invoiceDbService: asClass(InvoiceDatabaseService, { lifetime: Lifetime.SCOPED }),
    auditDbService: asClass(AuditDatabaseService, { lifetime: Lifetime.SCOPED }),
    creditsDbService: asClass(CreditsDatabaseService, { lifetime: Lifetime.SCOPED }),
  });

  // ── Circuit breakers (SINGLETON — must track failure counts) ───────────
  container.register({
    geminiCircuitBreaker: asFunction(
      () => new CircuitBreaker({ name: 'gemini' }),
      { lifetime: Lifetime.SINGLETON },
    ),
    openaiCircuitBreaker: asFunction(
      () => new CircuitBreaker({ name: 'openai' }),
      { lifetime: Lifetime.SINGLETON },
    ),
    mistralCircuitBreaker: asFunction(
      () => new CircuitBreaker({ name: 'mistral' }),
      { lifetime: Lifetime.SINGLETON },
    ),
  });

  // ── Cross-cutting (SINGLETON) ──────────────────────────────────────────
  container.register({
    logger: asValue(logger),
  });

  return container as TypedContainer;
}

// ─── Singleton app container ─────────────────────────────────────────────────

let _appContainer: TypedContainer | null = null;

/**
 * Return the application-level container, creating it on first call.
 *
 * Safe to call multiple times — subsequent calls return the same instance.
 */
export function getAppContainer(): TypedContainer {
  if (!_appContainer) {
    _appContainer = createAppContainer();
  }
  return _appContainer;
}

/**
 * Dispose the container and release all resources.
 *
 * Primarily useful in tests to ensure a clean slate.
 */
export async function disposeContainer(): Promise<void> {
  if (_appContainer) {
    await _appContainer.dispose();
    _appContainer = null;
  }
}
