/**
 * Server-only log context using AsyncLocalStorage.
 * Provides requestId / correlationId propagation across async call chains.
 *
 * IMPORTANT: This module uses `async_hooks` and only works in Node.js server runtime.
 * In client/browser bundles, the bundler swaps this for log-context.stub.ts:
 *   - Turbopack (next build): turbopack.resolveAlias with browser condition
 *   - Webpack (next dev): NormalModuleReplacementPlugin for client builds
 *
 * Usage in API routes:
 *   import { withLogContext } from '@/lib/log-context.server';
 *   export async function GET(req: Request) {
 *     return withLogContext({ requestId: crypto.randomUUID(), tenantId: '...' }, async () => {
 *       // logger.info() calls here automatically include requestId
 *     });
 *   }
 */
export interface LogContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
}

// Plain 'async_hooks' (no node: prefix) — webpack externalises it on the server,
// and both bundlers swap this entire module for log-context.stub.ts on the client.
// eslint-disable-next-line @typescript-eslint/no-require-imports
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
