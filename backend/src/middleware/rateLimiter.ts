import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

/**
 * Rate limiting simples por IP. Protege os endpoints de busca (que chamam a
 * API da Anthropic e APIs públicas de CNPJ) contra uso excessivo acidental.
 */
export const searchRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Muitas requisições em um curto período. Aguarde um momento e tente novamente.",
  },
});

export const generalRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMaxRequests * 5,
  standardHeaders: true,
  legacyHeaders: false,
});
