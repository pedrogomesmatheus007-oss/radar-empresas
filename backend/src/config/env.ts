import "dotenv/config";

function requireEnvAsNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  port: requireEnvAsNumber("PORT", 3333),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  /** String de conexão Postgres (Neon, Render Postgres, ou qualquer provedor
   * compatível). Ex: postgresql://usuario:senha@host/banco?sslmode=require */
  databaseUrl: process.env.DATABASE_URL ?? "",

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
  anthropicWebSearchMaxUses: requireEnvAsNumber("ANTHROPIC_WEB_SEARCH_MAX_USES", 6),

  brasilApiCnpjUrl: process.env.BRASILAPI_CNPJ_URL ?? "https://brasilapi.com.br/api/cnpj/v1",
  receitaWsCnpjUrl: process.env.RECEITAWS_CNPJ_URL ?? "https://www.receitaws.com.br/v1/cnpj",

  urlValidationTimeoutMs: requireEnvAsNumber("URL_VALIDATION_TIMEOUT_MS", 8000),
  cnpjValidationTimeoutMs: requireEnvAsNumber("CNPJ_VALIDATION_TIMEOUT_MS", 8000),

  rateLimitWindowMs: requireEnvAsNumber("RATE_LIMIT_WINDOW_MS", 60_000),
  rateLimitMaxRequests: requireEnvAsNumber("RATE_LIMIT_MAX_REQUESTS", 20),

  recentSearchesRetentionDays: requireEnvAsNumber("RECENT_SEARCHES_RETENTION_DAYS", 20),

  logLevel: (process.env.LOG_LEVEL ?? "info") as "debug" | "info" | "warn" | "error",
};

export function isAnthropicConfigured(): boolean {
  return env.anthropicApiKey.trim().length > 0;
}
