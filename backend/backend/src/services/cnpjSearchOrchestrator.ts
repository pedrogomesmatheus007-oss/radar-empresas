import { createLogger } from "../utils/logger.js";
import { getCnpjDiscoveryProvider } from "./cnpjDiscoveryService.js";
import { validateCnpj } from "./cnpjValidationService.js";
import { isPublicEntityByLegalNature, looksLikePublicEntityByNameOrDomain } from "./publicEntityService.js";
import { looksLikePersonName } from "./individualNameHeuristics.js";
import { getUsedCnpjs, insertCnpjIfNew } from "../db/cnpjsRepository.js";
import { getExcludedBrandNamesNormalized, matchesExcludedBrand } from "../db/excludedBrandsRepository.js";
import { recordSearch } from "../db/searchesRepository.js";
import { ensureAdCopyForNiche } from "./adCopyService.js";
import type { CnpjRecord, AdCopyRecord } from "../types/domain.js";

const logger = createLogger("cnpjSearchOrchestrator");

export interface CnpjSearchOutcome {
  results: CnpjRecord[];
  requestedQuantity: number;
  message: string;
  discardedReasons: string[];
  /** Sugestão de título/descrição de anúncio para o nicho (best-effort — null se não puder ser gerada). */
  adCopy: AdCopyRecord | null;
}

// Cada rodada extra é uma chamada nova de IA com busca na web (o maior custo
// por pesquisa). Reduzido de 3 para 1: se não achar tudo de uma vez, o
// usuário decide se quer gastar de novo clicando em "Pesquisar" outra vez,
// em vez de o sistema insistir sozinho até 3x automaticamente.
const MAX_DISCOVERY_ROUNDS = 1;

export async function searchCnpjsForNiche(niche: string, quantity: number): Promise<CnpjSearchOutcome> {
  const cleanNiche = niche.trim();
  const provider = getCnpjDiscoveryProvider();
  const excludedBrands = await getExcludedBrandNamesNormalized();
  const excludedBrandNames = [...excludedBrands];

  const results: CnpjRecord[] = [];
  const discardedReasons: string[] = [];
  const seenInThisRun = new Set<string>();

  for (let round = 0; round < MAX_DISCOVERY_ROUNDS && results.length < quantity; round++) {
    const stillNeeded = quantity - results.length;
    const usedCnpjs = await getUsedCnpjs();

    const candidates = await provider.discoverCandidates({
      niche: cleanNiche,
      excludedBrandNames,
      alreadyKnownCnpjs: [...usedCnpjs],
      quantity: Math.max(stillNeeded * 2, stillNeeded),
    });

    if (candidates.length === 0) break;

    for (const candidate of candidates) {
      if (results.length >= quantity) break;
      if (!candidate.cnpj || candidate.cnpj.length !== 14) continue;
      if (seenInThisRun.has(candidate.cnpj)) continue;
      seenInThisRun.add(candidate.cnpj);

      // Dedup permanente
      if (usedCnpjs.has(candidate.cnpj)) {
        continue;
      }

      // Marca excluída
      if (matchesExcludedBrand(candidate.companyName, excludedBrands)) {
        continue;
      }

      // Heurística por nome antes mesmo de gastar uma chamada de rede
      if (looksLikePublicEntityByNameOrDomain(candidate.companyName, "")) {
        continue;
      }
      if (looksLikePersonName(candidate.companyName)) {
        discardedReasons.push(`${candidate.companyName}: nome parece ser de pessoa física (padrão típico de MEI)`);
        continue;
      }

      // Validação real na fonte oficial/pública (BrasilAPI / ReceitaWS)
      const validation = await validateCnpj(candidate.cnpj);

      if (!validation.isValid) {
        discardedReasons.push(
          `${candidate.companyName} (${candidate.cnpj}): ${validation.reason ?? "não verificado"}`
        );
        continue;
      }

      if (validation.isActive !== true) {
        discardedReasons.push(`${candidate.companyName}: situação cadastral não confirmada como ATIVA`);
        continue;
      }

      if (validation.isMei === true) {
        discardedReasons.push(`${candidate.companyName}: é MEI, excluído por critério obrigatório`);
        continue;
      }

      // Reconfirma com a razão social OFICIAL (pode diferir do nome que a
      // descoberta usou) — cobre o caso de o campo opcao_pelo_mei não vir
      // preenchido pela fonte, mas o nome ainda assim ter cara de MEI/pessoa física.
      if (validation.companyName && looksLikePersonName(validation.companyName)) {
        discardedReasons.push(`${validation.companyName}: razão social oficial parece nome de pessoa física`);
        continue;
      }

      const publicByLegalNature = isPublicEntityByLegalNature(validation.legalNature);
      if (publicByLegalNature === true) {
        discardedReasons.push(`${candidate.companyName}: natureza jurídica indica órgão/empresa pública`);
        continue;
      }

      const saved = await insertCnpjIfNew({
        cnpj: candidate.cnpj,
        cnpjFormatted: validation.cnpjFormatted,
        companyName: validation.companyName ?? candidate.companyName,
        status: validation.statusDescription ?? "Não foi possível verificar este dado.",
        // Chegar aqui já garante que não é MEI (o `continue` acima descarta
        // isMei === true antes disso), então o valor guardado é sempre false.
        isMei: false,
        legalNature: validation.legalNature,
        niche: cleanNiche,
        sourceNote: candidate.sourceNote ?? null,
      });

      if (!saved) continue;

      usedCnpjs.add(candidate.cnpj);
      results.push(saved);
    }
  }

  await recordSearch({
    type: "cnpj",
    query: cleanNiche,
    requestedQuantity: quantity,
    resultQuantity: results.length,
  });

  const message =
    results.length >= quantity
      ? `Encontramos ${results.length} CNPJs novos que atendem aos critérios.`
      : `Encontramos ${results.length} CNPJ${results.length === 1 ? "" : "s"} novo${
          results.length === 1 ? "" : "s"
        } que atende${results.length === 1 ? "" : "m"} aos critérios. Não foram encontrados resultados adicionais.`;

  logger.info("Busca de CNPJ concluída", { niche: cleanNiche, encontrados: results.length, quantity });

  // Best-effort: já vem cacheado se esse nicho já foi pesquisado antes, então
  // normalmente não gasta nenhuma chamada extra de API.
  const adCopy = await ensureAdCopyForNiche(cleanNiche);

  return { results, requestedQuantity: quantity, message, discardedReasons, adCopy };
}
