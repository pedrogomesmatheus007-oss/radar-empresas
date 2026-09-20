import { Router } from "express";
import { searchRequestSchema, manualUrlSchema, validateBody } from "../middleware/validation.js";
import { searchRateLimiter, generalRateLimiter } from "../middleware/rateLimiter.js";
import { searchUrlsForNiche, getDomainsForNiche } from "../services/urlSearchOrchestrator.js";
import { addUrlManually } from "../services/manualEntryService.js";
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

// Modo "adicionar manualmente": custo ZERO de API (nenhuma chamada à
// Anthropic) — só verificação real via HTTP + fonte oficial de CNPJ.
urlsRouter.post("/manual", generalRateLimiter, validateBody(manualUrlSchema), async (req, res, next) => {
  try {
    const { companyName, url, niche, cnpj } = req.body as {
      companyName: string;
      url: string;
      niche: string;
      cnpj?: string | null;
    };
    const result = await addUrlManually({ companyName, url, niche, cnpj });
    if (!result.ok) {
      res.status(422).json({ error: result.reason });
      return;
    }
    res.json({ result: result.saved });
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
