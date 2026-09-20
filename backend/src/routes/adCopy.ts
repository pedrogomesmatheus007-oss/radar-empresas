import { Router } from "express";
import { getAdCopyForNiche } from "../db/adCopyRepository.js";

export const adCopyRouter = Router();

/**
 * Só LEITURA do que já está salvo — a geração acontece automaticamente
 * (best-effort) dentro das buscas de URL/CNPJ (ver ensureAdCopyForNiche),
 * nunca aqui, para esta rota nunca gastar crédito de API sozinha.
 */
adCopyRouter.get("/", async (req, res, next) => {
  try {
    const niche = typeof req.query.niche === "string" ? req.query.niche.trim() : "";
    if (!niche) {
      res.json({ result: null });
      return;
    }
    const result = await getAdCopyForNiche(niche);
    res.json({ result });
  } catch (err) {
    next(err);
  }
});
