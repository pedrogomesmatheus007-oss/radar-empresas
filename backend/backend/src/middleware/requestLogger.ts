import type { RequestHandler } from "express";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("http");

export const requestLogger: RequestHandler = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.info(`${req.method} ${req.originalUrl} -> ${res.statusCode}`, {
      durationMs: Date.now() - start,
    });
  });
  next();
};
