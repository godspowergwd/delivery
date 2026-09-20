type Level = 'debug' | 'info' | 'warn' | 'error';

const COLORS: Record<Level, string> = {
  debug: '\u001b[90m',
  info: '\u001b[36m',
  warn: '\u001b[33m',
  error: '\u001b[31m',
};

const RESET = '\u001b[0m';

function write(level: Level, message: string, meta?: unknown): void {
  const stamp = new Date().toISOString();
  const prefix = `${COLORS[level]}[${level.toUpperCase()}]${RESET} ${stamp} ${message}`;
  if (meta === undefined) {
    console.log(prefix);
    return;
  }
  console.log(prefix, meta);
}

export const logger = {
  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production') write('debug', message, meta);
  },
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
};