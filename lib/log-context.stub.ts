// Client-side no-op stub for log-context.server.ts
// Turbopack aliases this in for browser builds (see next.config.js resolveAlias)

export interface LogContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
}

export function getLogContext(): LogContext | undefined {
  return undefined;
}

export function withLogContext<T>(_ctx: LogContext, fn: () => T): T {
  return fn();
}
