type Level = 'debug' | 'info' | 'warn' | 'error';

const COLORS: Record<Level, string> = {
  debug: '\u001b[90m',
  info: '\u001b[36m',
  warn: '\u001b[33m',
  error: '\u001b[31m',
};

const RESET = '\u001b[0m';

const SENSITIVE_FIELD = /password|token|secret|authorization|cookie|connectionstring|databaseurl|accesskey|api.?key/i;

export function redactLogText(value: string): string {
  return value
    .replace(/(postgres(?:ql)?:\/\/)[^\s@/]+@/gi, '$1[REDACTED]@')
    .replace(/([?&](?:access_token|refresh_token|token|api[_-]?key|key|password|secret)=)[^&#\s]*/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]');
}

function sanitizeMeta(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactLogText(value);
  if (value instanceof Error) {
    return { name: value.name, message: redactLogText(value.message) };
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeMeta(item, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_FIELD.test(key) ? '[REDACTED]' : sanitizeMeta(item, seen),
    ]),
  );
}

function write(level: Level, message: string, meta?: unknown): void {
  const stamp = new Date().toISOString();
  const prefix = `${COLORS[level]}[${level.toUpperCase()}]${RESET} ${stamp} ${redactLogText(message)}`;
  if (meta === undefined) {
    console.log(prefix);
    return;
  }
  console.log(prefix, sanitizeMeta(meta));
}

export const logger = {
  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production') write('debug', message, meta);
  },
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
};