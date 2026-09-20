import { Router } from "express";
import { searchRequestSchema, manualCnpjSchema, validateBody } from "../middleware/validation.js";
import { searchRateLimiter, generalRateLimiter } from "../middleware/rateLimiter.js";
import { searchCnpjsForNiche } from "../services/cnpjSearchOrchestrator.js";
import { addCnpjManually } from "../services/manualEntryService.js";
import { listAllCnpjs, listCnpjsByNiche, countCnpjs } from "../db/cnpjsRepository.js";

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

// Modo "adicionar manualmente": custo ZERO de API (nenhuma chamada à
// Anthropic) — só verificação real na fonte oficial de CNPJ.
cnpjRouter.post("/manual", generalRateLimiter, validateBody(manualCnpjSchema), async (req, res, next) => {
  try {
    const { companyName, cnpj, niche } = req.body as { companyName: string; cnpj: string; niche: string };
    const result = await addCnpjManually({ companyName, cnpj, niche });
    if (!result.ok) {
      res.status(422).json({ error: result.reason });
      return;
    }
    res.json({ result: result.saved });
  } catch (err) {
    next(err);
  }
});

cnpjRouter.get("/", async (req, res, next) => {
  try {
    const niche = typeof req.query.niche === "string" ? req.query.niche : null;
    const results = niche ? await listCnpjsByNiche(niche) : await listAllCnpjs();
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
