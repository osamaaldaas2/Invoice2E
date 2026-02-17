/**
 * Server-only log context using AsyncLocalStorage.
 * Provides requestId / correlationId propagation across async call chains.
 *
 * IMPORTANT: This module uses `async_hooks` and must NEVER be imported
 * in client components or Edge Runtime. Use the `server-only` guard.
 *
 * Usage in API routes:
 *   import { withLogContext } from '@/lib/log-context.server';
 *   export async function GET(req: Request) {
 *     return withLogContext({ requestId: crypto.randomUUID(), tenantId: '...' }, async () => {
 *       // logger.info() calls here automatically include requestId
 *     });
 *   }
 */
import 'server-only';

export interface LogContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
}

// Dynamic require keeps async_hooks out of the browser/Edge bundle

const { AsyncLocalStorage } = require('async_hooks') as typeof import('async_hooks');

const storage = new AsyncLocalStorage<LogContext>();

/** Run `fn` with the given log context active for all logger calls inside it. */
export function withLogContext<T>(ctx: LogContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Read the current log context (returns undefined outside a withLogContext scope). */
export function getLogContext(): LogContext | undefined {
  return storage.getStore();
}
