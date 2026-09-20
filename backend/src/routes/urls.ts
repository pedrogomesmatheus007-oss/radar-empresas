import { Router } from "express";
import { searchRequestSchema, validateBody } from "../middleware/validation.js";
import { searchRateLimiter } from "../middleware/rateLimiter.js";
import { searchUrlsForNiche, getDomainsForNiche } from "../services/urlSearchOrchestrator.js";
import { listAllDomains, countDomains } from "../db/domainsRepository.js";

export const urlsRouter = Router();

urlsRouter.post("/search", searchRateLimiter, validateBody(searchRequestSchema), async (req, res, next) => {
  try {
    const { niche, quantity } = req.body as { niche: string; quantity: number };
    const outcome = await searchUrlsForNiche(niche, quantity);
    res.json(outcome);
  } catch (err) {
    next(err);
  }
});

urlsRouter.get("/", async (req, res, next) => {
  try {
    const niche = typeof req.query.niche === "string" ? req.query.niche : null;
    const results = niche ? await getDomainsForNiche(niche) : await listAllDomains();
    res.json({ results, total: results.length });
  } catch (err) {
    next(err);
  }
});

urlsRouter.get("/count", async (_req, res, next) => {
  try {
    res.json({ total: await countDomains() });
  } catch (err) {
    next(err);
  }
});
