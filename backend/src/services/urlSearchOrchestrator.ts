import { createLogger } from "../utils/logger.js";
import { normalizeDomain } from "../utils/textNormalization.js";
import { getCompanyDiscoveryProvider } from "./discoveryService.js";
import { validateUrl } from "./urlValidationService.js";
import { validateCnpj } from "./cnpjValidationService.js";
import { runComplianceScreening } from "./complianceService.js";
import { isPublicEntityByLegalNature, looksLikePublicEntityByNameOrDomain } from "./publicEntityService.js";
import { looksLikePersonName } from "./individualNameHeuristics.js";
import {
  getUsedNormalizedDomains,
  getUsedCnpjsFromDomains,
  insertDomainIfNew,
  listDomainsByNiche,
} from "../db/domainsRepository.js";
import { getUsedCnpjs } from "../db/cnpjsRepository.js";
import {
  getExcludedBrandNamesNormalized,
  matchesExcludedBrand,
} from "../db/excludedBrandsRepository.js";
import { recordSearch } from "../db/searchesRepository.js";
import type { DomainRecord } from "../types/domain.js";

const logger = createLogger("urlSearchOrchestrator");

export interface UrlSearchResultItem extends DomainRecord {
  complianceLabel: "APTO PARA REVISÃO" | "REVISÃO NECESSÁRIA";
}

export interface UrlSearchOutcome {
  results: UrlSearchResultItem[];
  requestedQuantity: number;
  message: string;
}

const MAX_DISCOVERY_ROUNDS = 3;

interface PairedCnpjFields {
  cnpj: string | null;
  cnpjFormatted: string | null;
  cnpjStatus: string | null;
  cnpjLegalNature: string | null;
  cnpjVerified: boolean;
}

const NO_CNPJ_PAIRED: PairedCnpjFields = {
  cnpj: null,
  cnpjFormatted: null,
  cnpjStatus: null,
  cnpjLegalNature: null,
  cnpjVerified: false,
};

/**
 * Valida (sem nenhuma chamada extra de IA) o CNPJ que a própria busca de
 * empresas já trouxe para essa URL (pedido do usuário: "cada URL um CNPJ
 * também"). Antes, isso fazia uma segunda chamada de IA com busca na web
 * por empresa — trocado por reaproveitar o CNPJ da busca original e só
 * confirmá-lo numa fonte oficial gratuita (BrasilAPI/ReceitaWS), o que
 * reduz muito o consumo de créditos por pesquisa sem abrir mão da regra de
 * nunca inventar dado: aplica os MESMOS critérios obrigatórios da aba CNPJ —
 * ATIVA, não-MEI, não parece pessoa física, não é órgão público, e nunca
 * repete um CNPJ já usado em lugar nenhum. Se o CNPJ não veio na busca, ou
 * qualquer verificação falhar, retorna "não emparelhado" — a URL ainda é
 * mostrada normalmente, só sem o CNPJ.
 */
async function tryPairCnpj(
  companyName: string,
  rawCnpj: string | null | undefined,
  excludedBrands: Set<string>,
  usedCnpjsGlobal: Set<string>
): Promise<PairedCnpjFields> {
  if (!rawCnpj || rawCnpj.length !== 14) return NO_CNPJ_PAIRED;
  if (usedCnpjsGlobal.has(rawCnpj)) return NO_CNPJ_PAIRED;

  try {
    const validation = await validateCnpj(rawCnpj);
    if (!validation.isValid) return NO_CNPJ_PAIRED;
    if (validation.isActive !== true) return NO_CNPJ_PAIRED;
    if (validation.isMei === true) return NO_CNPJ_PAIRED;
    if (validation.companyName && looksLikePersonName(validation.companyName)) return NO_CNPJ_PAIRED;
    if (matchesExcludedBrand(validation.companyName ?? companyName, excludedBrands)) return NO_CNPJ_PAIRED;
    if (isPublicEntityByLegalNature(validation.legalNature) === true) return NO_CNPJ_PAIRED;
    if (usedCnpjsGlobal.has(validation.cnpj)) return NO_CNPJ_PAIRED;

    return {
      cnpj: validation.cnpj,
      cnpjFormatted: validation.cnpjFormatted,
      cnpjStatus: validation.statusDescription,
      cnpjLegalNature: validation.legalNature,
      cnpjVerified: true,
    };
  } catch (err) {
    // Uma falha ao tentar validar o CNPJ (rate limit, erro de rede, etc.)
    // nunca deve derrubar o resultado da URL — só fica sem CNPJ emparelhado.
    logger.debug("Não foi possível validar o CNPJ pareado para a URL", { companyName, error: String(err) });
    return NO_CNPJ_PAIRED;
  }
}

/**
 * Executa o fluxo obrigatório da seção 16 do briefing:
 * descoberta → normalização → dedup → marcas excluídas → órgãos públicos →
 * verificação HTTP → análise de conteúdo → triagem Google Ads → parear CNPJ →
 * salvar → retornar.
 */
export async function searchUrlsForNiche(niche: string, quantity: number): Promise<UrlSearchOutcome> {
  const cleanNiche = niche.trim();
  const provider = getCompanyDiscoveryProvider();
  const excludedBrands = await getExcludedBrandNamesNormalized();
  const excludedBrandNames = [...excludedBrands];

  const results: UrlSearchResultItem[] = [];
  const seenInThisRun = new Set<string>();

  for (let round = 0; round < MAX_DISCOVERY_ROUNDS && results.length < quantity; round++) {
    const stillNeeded = quantity - results.length;
    const usedDomains = await getUsedNormalizedDomains(); // relê a cada rodada para refletir o que já foi salvo
    const usedCnpjsGlobal = new Set([...(await getUsedCnpjs()), ...(await getUsedCnpjsFromDomains())]);

    const candidates = await provider.discoverCandidates({
      niche: cleanNiche,
      excludedBrandNames,
      alreadyKnownDomains: [...usedDomains],
      quantity: Math.max(stillNeeded * 2, stillNeeded), // pede uma margem, pois vários serão descartados
    });

    if (candidates.length === 0) break;

    for (const candidate of candidates) {
      if (results.length >= quantity) break;

      const normalizedDomain = normalizeDomain(candidate.url);
      if (!normalizedDomain || normalizedDomain.length < 3) continue;
      if (seenInThisRun.has(normalizedDomain)) continue;
      seenInThisRun.add(normalizedDomain);

      // 6. Consultar banco de domínios já usados / eliminar duplicados
      if (usedDomains.has(normalizedDomain)) {
        logger.debug("Domínio descartado: já usado anteriormente", { normalizedDomain });
        continue;
      }

      // 7. Eliminar marcas excluídas
      if (matchesExcludedBrand(candidate.companyName, excludedBrands) || matchesExcludedBrand(normalizedDomain, excludedBrands)) {
        logger.debug("Domínio descartado: marca excluída", { normalizedDomain });
        continue;
      }

      // 8. Eliminar empresas/órgãos públicos (heurística por nome/domínio)
      if (looksLikePublicEntityByNameOrDomain(candidate.companyName, normalizedDomain)) {
        logger.debug("Domínio descartado: parece órgão público", { normalizedDomain });
        continue;
      }

      // 9. Verificar se a URL está acessível (HTTP/HTTPS real)
      const validation = await validateUrl(candidate.url);
      if (!validation.isValid || !validation.finalUrl) {
        logger.debug("Domínio descartado: não passou na verificação HTTP", {
          normalizedDomain,
          reason: validation.reason,
        });
        continue;
      }

      // 10-11. Analisar conteúdo básico + triagem de políticas do Google Ads
      const compliance = runComplianceScreening({
        url: validation.finalUrl,
        htmlSnippet: validation.htmlSnippet,
        companyName: candidate.companyName,
      });

      // 12. Eliminar resultados com incompatibilidades evidentes
      if (compliance.verdict === "REJECT") {
        logger.debug("Domínio descartado: sinais evidentes de incompatibilidade com políticas do Google Ads", {
          normalizedDomain,
          signals: compliance.signals,
        });
        continue;
      }

      // 12b. Validar o CNPJ que a própria busca já trouxe para essa empresa
      // (best-effort — a URL é mostrada de qualquer forma, com ou sem CNPJ).
      const cnpjFields = await tryPairCnpj(candidate.companyName, candidate.cnpj, excludedBrands, usedCnpjsGlobal);
      if (cnpjFields.cnpj) usedCnpjsGlobal.add(cnpjFields.cnpj);

      // 13. Salvar novo domínio no banco (constraint UNIQUE garante atomicidade)
      const saved = await insertDomainIfNew({
        domain: candidate.url,
        normalizedDomain,
        url: validation.finalUrl,
        companyName: candidate.companyName,
        niche: cleanNiche,
        complianceStatus: compliance.verdict === "PASS_REVIEW" ? "PASS_REVIEW" : "MANUAL_REVIEW",
        sourceNote: candidate.sourceNote ?? null,
        ...cnpjFields,
      });

      if (!saved) {
        // Corrida rara: outro processo salvou o mesmo domínio entre a checagem e o insert.
        continue;
      }

      usedDomains.add(normalizedDomain);
      results.push({
        ...saved,
        complianceLabel: compliance.verdict === "PASS_REVIEW" ? "APTO PARA REVISÃO" : "REVISÃO NECESSÁRIA",
      });
    }
  }

  await recordSearch({
    type: "urls",
    query: cleanNiche,
    requestedQuantity: quantity,
    resultQuantity: results.length,
  });

  const message =
    results.length >= quantity
      ? `Encontramos ${results.length} URLs novas que atendem aos critérios.`
      : `Encontramos ${results.length} URL${results.length === 1 ? "" : "s"} nova${
          results.length === 1 ? "" : "s"
        } que atende${results.length === 1 ? "" : "m"} aos critérios. Não foram encontrados resultados adicionais.`;

  return { results, requestedQuantity: quantity, message };
}

export async function getDomainsForNiche(niche: string): Promise<DomainRecord[]> {
  return listDomainsByNiche(niche.trim());
}
