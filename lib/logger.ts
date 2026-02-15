type LogLevel = 'info' | 'error' | 'warn' | 'debug';

type LogData = Record<string, unknown>;

type LogEntry = {
  timestamp: string;
  level: string;
  message: string;
  data?: LogData;
};

const formatLog = (level: LogLevel, message: string, data?: LogData): LogEntry => {
  const timestamp = new Date().toISOString();
  const entry: LogEntry = {
    timestamp,
    level: level.toUpperCase(),
    message,
  };
  if (data) {
    entry.data = data;
  }
  return entry;
};

const isDevelopment = (): boolean => {
  return process.env.NODE_ENV === 'development';
};

export const logger = {
  info: (message: string, data?: LogData): void => {
    const entry = formatLog('info', message, data);
    // Using console.info for structured logging (allowed per CONSTITUTION for logger service)
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
