type Level = "INFO" | "WARN" | "ERROR" | "DEBUG";

function log(level: Level, message: string, context?: Record<string, unknown>): void {
  console[level === "ERROR" ? "error" : "log"](
    JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...context }),
  );
}

export const logger = {
  info:  (msg: string, ctx?: Record<string, unknown>) => log("INFO",  msg, ctx),
  warn:  (msg: string, ctx?: Record<string, unknown>) => log("WARN",  msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log("ERROR", msg, ctx),
  debug: (msg: string, ctx?: Record<string, unknown>) => log("DEBUG", msg, ctx),
};
