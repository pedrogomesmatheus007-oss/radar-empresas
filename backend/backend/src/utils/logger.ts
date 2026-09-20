import { env } from "../config/env.js";

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function shouldLog(level: Level): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[env.logLevel];
}

function format(level: Level, scope: string, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] [${scope}] ${message}`;
  if (meta === undefined) return base;
  try {
    return `${base} ${JSON.stringify(meta)}`;
  } catch {
    return `${base} [meta não serializável]`;
  }
}

export function createLogger(scope: string) {
  return {
    debug(message: string, meta?: unknown) {
      if (shouldLog("debug")) console.debug(format("debug", scope, message, meta));
    },
    info(message: string, meta?: unknown) {
      if (shouldLog("info")) console.info(format("info", scope, message, meta));
    },
    warn(message: string, meta?: unknown) {
      if (shouldLog("warn")) console.warn(format("warn", scope, message, meta));
    },
    error(message: string, meta?: unknown) {
      if (shouldLog("error")) console.error(format("error", scope, message, meta));
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
