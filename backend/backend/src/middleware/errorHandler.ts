import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { createLogger } from "../utils/logger.js";
import { DiscoveryNotConfiguredError } from "../services/discoveryService.js";

const logger = createLogger("errorHandler");

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Dados de entrada inválidos.",
      details: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
    return;
  }

  if (err instanceof DiscoveryNotConfiguredError) {
    res.status(503).json({ error: err.message });
    return;
  }

  logger.error("Erro não tratado", { error: err instanceof Error ? err.stack ?? err.message : String(err) });
  res.status(500).json({ error: "Erro interno do servidor. Consulte os logs do backend para mais detalhes." });
};
