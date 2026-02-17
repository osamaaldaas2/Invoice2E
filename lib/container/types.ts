/**
 * Typed container contents and scope definitions for the Awilix DI container.
 *
 * Intent: Provide compile-time safety for dependency resolution.
 */

import type { AwilixContainer } from 'awilix';
import type { GeminiAdapter } from '@/adapters/gemini.adapter';
import type { OpenAIAdapter } from '@/adapters/openai.adapter';
import type { MistralAdapter } from '@/adapters/mistral.adapter';
import type { ExtractorFactory } from '@/services/ai/extractor.factory';
import type { InvoiceDatabaseService } from '@/services/invoice.db.service';
import type { AuditDatabaseService } from '@/services/audit.db.service';
import type { CreditsDatabaseService } from '@/services/credits.db.service';
import type { CircuitBreaker } from '@/lib/circuit-breaker';
import type { logger } from '@/lib/logger';

// ─── Service Scope ───────────────────────────────────────────────────────────

/** Lifetime scope for container registrations */
export type ServiceScope = 'SINGLETON' | 'SCOPED' | 'TRANSIENT';

// ─── Cradle ──────────────────────────────────────────────────────────────────

/**
 * Typed container contents — every registered service appears here.
 *
 * When resolving from the container, TypeScript knows the exact return type:
 * ```ts
 * const log = getService('logger');
 * ```
 */
export interface Cradle {
  // ── Adapters (SINGLETON — stateful, hold API clients) ──────────────────
  geminiAdapter: GeminiAdapter;
  openaiAdapter: OpenAIAdapter;
  mistralAdapter: MistralAdapter;

  // ── Factories (SCOPED — may vary per request context) ──────────────────
  extractorFactory: typeof ExtractorFactory;

  // ── Database services (SCOPED — use per-request Supabase clients) ──────
  invoiceDbService: InvoiceDatabaseService;
  auditDbService: AuditDatabaseService;
  creditsDbService: CreditsDatabaseService;

  // ── Circuit breakers (SINGLETON — stateful counters) ───────────────────
  geminiCircuitBreaker: CircuitBreaker;
  openaiCircuitBreaker: CircuitBreaker;
  mistralCircuitBreaker: CircuitBreaker;

  // ── Cross-cutting (SINGLETON) ──────────────────────────────────────────
  logger: typeof logger;
}

// ─── Typed container alias ───────────────────────────────────────────────────

/** Fully-typed Awilix container */
export type TypedContainer = AwilixContainer<Cradle>;
