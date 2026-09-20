import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { generalRateLimiter } from "./middleware/rateLimiter.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { urlsRouter } from "./routes/urls.js";
import { cnpjRouter } from "./routes/cnpj.js";
import { searchesRouter } from "./routes/searches.js";
import { excludedBrandsRouter } from "./routes/excludedBrands.js";
import { statsRouter } from "./routes/stats.js";
import { exportRouter } from "./routes/export.js";
import { adCopyRouter } from "./routes/adCopy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// backend/public — o frontend (index.html/style.css/script.js) é servido
// pelo próprio backend, no mesmo endereço/porta. Isso evita CORS e faz o
// usuário rodar um único comando (npm run dev) e abrir uma única URL.
const PUBLIC_DIR = path.resolve(__dirname, "../public");

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: "1mb" }));
  app.use(requestLogger);
  app.use(generalRateLimiter);

  app.use(express.static(PUBLIC_DIR));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/urls", urlsRouter);
  app.use("/api/cnpj", cnpjRouter);
  app.use("/api/searches", searchesRouter);
  app.use("/api/excluded-brands", excludedBrandsRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/export", exportRouter);
  app.use("/api/ad-copy", adCopyRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
