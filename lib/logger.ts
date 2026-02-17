/**
 * Structured JSON logger.
 *
 * Features:
 * - JSON output on every line (timestamp, level, message, data)
 * - PII redaction: sensitive field values replaced with [REDACTED]
 * - requestId/tenantId/userId propagation via log-context.server.ts
 *   (server-only; no-op in browser/Edge because getLogContext is lazy-imported)
 */

type LogLevel = 'info' | 'error' | 'warn' | 'debug';
type LogData = Record<string, unknown>;

type LogEntry = {
  timestamp: string;
  level: string;
  message: string;
  requestId?: string;
  tenantId?: string;
  userId?: string;
  data?: LogData;
};

// ─── PII Redaction ────────────────────────────────────────────────────────────

/**
 * Field keys whose VALUES must never appear in logs.
 * Keys are still visible (so you know the field exists) but values become [REDACTED].
 */
const SENSITIVE_KEYS = new Set([
  'taxId',
  'vatId',
  'vatNumber',
  'sellerVatId',
  'buyerVatId',
  'sellerTaxId',
  'buyerTaxId',
  'sellerTaxNumber',
  'buyerTaxNumber',
  'iban',
  'sellerIban',
  'bic',
  'sellerBic',
  'bankAccount',
  'email',
  'sellerEmail',
  'buyerEmail',
  'accessToken',
  'apiKey',
  'secret',
  'password',
  'authorization',
  'jwt',
  'token',
  'refreshToken',
  'sessionToken',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'STRIPE_SECRET_KEY',
  'SENDGRID_API_KEY',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'MISTRAL_API_KEY',
  'BATCH_WORKER_SECRET',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return value; // guard against circular structures
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redact(val, depth + 1);
    }
  }
  return result;
}

// ─── Context injection (server-only, lazy) ────────────────────────────────────

let _getLogContext:
  | (() => { requestId?: string; tenantId?: string; userId?: string } | undefined)
  | null = null;

function tryGetContext(): { requestId?: string; tenantId?: string; userId?: string } | undefined {
  if (_getLogContext !== null) return _getLogContext();
  // Lazy import: only works in Node.js server runtime, silently skipped in Edge/browser
  try {
    // Dynamic require to avoid bundling async_hooks into client code

    const mod = require('@/lib/log-context.server') as {
      getLogContext: () => { requestId?: string; tenantId?: string; userId?: string } | undefined;
    };

    _getLogContext = mod.getLogContext;
    return _getLogContext();
  } catch {
    _getLogContext = () => undefined;
    return undefined;
  }
}

// ─── Formatter ────────────────────────────────────────────────────────────────

const formatLog = (level: LogLevel, message: string, data?: LogData): LogEntry => {
  const timestamp = new Date().toISOString();
  const ctx = tryGetContext();

  const entry: LogEntry = {
    timestamp,
    level: level.toUpperCase(),
    message,
  };

  if (ctx?.requestId) entry.requestId = ctx.requestId;
  if (ctx?.tenantId) entry.tenantId = ctx.tenantId;
  if (ctx?.userId) entry.userId = ctx.userId;

  if (data) {
    entry.data = redact(data) as LogData;
  }

  return entry;
};

const isDevelopment = (): boolean => process.env.NODE_ENV === 'development';

// ─── Public API ───────────────────────────────────────────────────────────────

export const logger = {
  info: (message: string, data?: LogData): void => {
    const entry = formatLog('info', message, data);
    // eslint-disable-next-line no-console
    console.info(JSON.stringify(entry));
  },

  error: (message: string, errorOrData?: Error | LogData | unknown): void => {
    let errorData: LogData | undefined;
    if (errorOrData instanceof Error) {
      errorData = { message: errorOrData.message, stack: errorOrData.stack };
    } else if (
      errorOrData !== null &&
      typeof errorOrData === 'object' &&
      !Array.isArray(errorOrData)
    ) {
      errorData = errorOrData as LogData;
    } else if (errorOrData !== undefined) {
      errorData = { error: String(errorOrData) };
    }
    const entry = formatLog('error', message, errorData);
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(entry));
  },

  warn: (message: string, data?: LogData): void => {
    const entry = formatLog('warn', message, data);
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify(entry));
  },

  debug: (message: string, data?: LogData): void => {
    if (isDevelopment()) {
      const entry = formatLog('debug', message, data);
      // eslint-disable-next-line no-console
      console.debug(JSON.stringify(entry));
    }
  },
};
