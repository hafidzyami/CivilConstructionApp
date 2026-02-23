/**
 * Centralized logger utility for Civil Construction App backend.
 * Provides structured, leveled, timestamped logging with color output.
 */

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

const COLORS: Record<LogLevel, string> = {
  INFO: '\x1b[36m',   // Cyan
  WARN: '\x1b[33m',   // Yellow
  ERROR: '\x1b[31m',  // Red
  DEBUG: '\x1b[35m',  // Magenta
};
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

function timestamp(): string {
  return new Date().toISOString();
}

function format(level: LogLevel, context: string, message: string, meta?: object): string {
  const color = COLORS[level];
  const ts = `${DIM}${timestamp()}${RESET}`;
  const lvl = `${color}${BOLD}${level.padEnd(5)}${RESET}`;
  const ctx = `${BOLD}[${context}]${RESET}`;
  const metaStr = meta ? ` ${DIM}${JSON.stringify(meta)}${RESET}` : '';
  return `${ts} ${lvl} ${ctx} ${message}${metaStr}`;
}

export const logger = {
  info(context: string, message: string, meta?: object): void {
    console.log(format('INFO', context, message, meta));
  },

  warn(context: string, message: string, meta?: object): void {
    console.warn(format('WARN', context, message, meta));
  },

  error(context: string, message: string, meta?: object): void {
    console.error(format('ERROR', context, message, meta));
  },

  debug(context: string, message: string, meta?: object): void {
    if (process.env.NODE_ENV !== 'production') {
      console.log(format('DEBUG', context, message, meta));
    }
  },
};

export default logger;
