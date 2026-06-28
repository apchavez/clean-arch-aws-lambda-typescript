type Level = "info" | "warn" | "error";

const CONSOLE: Record<Level, (...args: unknown[]) => void> = {
  info: console.info,
  warn: console.warn,
  error: console.error,
};

function log(level: Level, message: string, context?: Record<string, unknown>): void {
  CONSOLE[level](JSON.stringify({ level, message, ...context }));
}

export const logger = {
  info: (msg: string, ctx?: Record<string, unknown>) => log("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log("error", msg, ctx),
};
