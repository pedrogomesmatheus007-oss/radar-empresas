import { Router } from "express";
import { searchRequestSchema, validateBody } from "../middleware/validation.js";
import { searchRateLimiter } from "../middleware/rateLimiter.js";
import { searchCnpjsForNiche } from "../services/cnpjSearchOrchestrator.js";
import { listAllCnpjs, countCnpjs } from "../db/cnpjsRepository.js";

export const cnpjRouter = Router();

cnpjRouter.post("/search", searchRateLimiter, validateBody(searchRequestSchema), async (req, res, next) => {
  try {
    const { niche, quantity } = req.body as { niche: string; quantity: number };
    const outcome = await searchCnpjsForNiche(niche, quantity);
    res.json(outcome);
  } catch (err) {
    next(err);
  }
});

cnpjRouter.get("/", async (_req, res, next) => {
  try {
    const results = await listAllCnpjs();
    res.json({ results, total: results.length });
  } catch (err) {
    next(err);
  }
});

cnpjRouter.get("/count", async (_req, res, next) => {
  try {
    res.json({ total: await countCnpjs() });
  } catch (err) {
    next(err);
  }
});
