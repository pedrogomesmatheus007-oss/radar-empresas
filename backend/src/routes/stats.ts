import { Router } from "express";
import { countDomains } from "../db/domainsRepository.js";
import { countCnpjs } from "../db/cnpjsRepository.js";
import { listRecentSearches } from "../db/searchesRepository.js";
import { isAnthropicConfigured } from "../config/env.js";

export const statsRouter = Router();

statsRouter.get("/", async (_req, res, next) => {
  try {
    const recentSearches = await listRecentSearches();
    res.json({
      urlsEncontradas: await countDomains(),
      urlsJaUtilizadas: await countDomains(),
      cnpjsEncontrados: await countCnpjs(),
      cnpjsJaUtilizados: await countCnpjs(),
      pesquisasUltimos20Dias: recentSearches.length,
      anthropicConfigured: isAnthropicConfigured(),
    });
  } catch (err) {
    next(err);
  }
});
