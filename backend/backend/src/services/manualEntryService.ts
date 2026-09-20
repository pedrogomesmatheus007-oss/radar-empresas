import { normalizeDomain, onlyDigits } from "../utils/textNormalization.js";
import { validateUrl } from "./urlValidationService.js";
import { validateCnpj } from "./cnpjValidationService.js";
import { runComplianceScreening } from "./complianceService.js";
import { isPublicEntityByLegalNature, looksLikePublicEntityByNameOrDomain } from "./publicEntityService.js";
import { looksLikePersonName } from "./individualNameHeuristics.js";
import { getUsedNormalizedDomains, getUsedCnpjsFromDomains, insertDomainIfNew } from "../db/domainsRepository.js";
import { getUsedCnpjs, insertCnpjIfNew } from "../db/cnpjsRepository.js";
import { getExcludedBrandNamesNormalized, matchesExcludedBrand } from "../db/excludedBrandsRepository.js";
import type { DomainRecord, CnpjRecord } from "../types/domain.js";

/**
 * Modo "adicionar manualmente": o usuário já achou a empresa sozinho (ex:
 * pelo Google) e só quer que a ferramenta faça a parte de VERIFICAÇÃO real —
 * HTTP de verdade para URL, consulta oficial (BrasilAPI/ReceitaWS) para
 * CNPJ — sem chamar a Anthropic em nenhum momento. Por isso este arquivo tem
 * custo ZERO de API: usa exatamente as mesmas fontes gratuitas que a busca
 * automática já usa para confirmar dados, só que sem a etapa de "descobrir"
 * candidatos por IA. Aplica as MESMAS regras obrigatórias (dedup permanente,
 * marca excluída, órgão público, MEI, nome de pessoa física, triagem do
 * Google Ads) — nada aqui é menos rigoroso, só menos automático.
 */

export interface ManualResult<T> {
  ok: boolean;
  reason?: string;
  saved?: T;
}

interface ValidatedCnpjFields {
  cnpj: string;
  cnpjFormatted: string;
  cnpjStatus: string | null;
  cnpjLegalNature: string | null;
  cnpjOfficialCompanyName: string | null;
}

async function validateCnpjAgainstRules(
  companyName: string,
  rawCnpjInput: string,
  excludedBrands: Set<string>,
  usedCnpjsGlobal: Set<string>
): Promise<{ ok: true; fields: ValidatedCnpjFields } | { ok: false; reason: string }> {
  const rawCnpj = onlyDigits(rawCnpjInput);
  if (rawCnpj.length !== 14) return { ok: false, reason: "O CNPJ precisa ter 14 dígitos." };
  if (usedCnpjsGlobal.has(rawCnpj)) {
    return { ok: false, reason: "Este CNPJ já está salvo no banco (a proteção contra repetição é permanente)." };
  }

  const validation = await validateCnpj(rawCnpj);
  if (!validation.isValid) return { ok: false, reason: validation.reason ?? "CNPJ não pôde ser verificado." };
  if (validation.isActive !== true) return { ok: false, reason: "Situação cadastral não confirmada como ATIVA." };
  if (validation.isMei === true) return { ok: false, reason: "É MEI — excluído por critério obrigatório." };
  if (validation.companyName && looksLikePersonName(validation.companyName)) {
    return { ok: false, reason: "A razão social oficial parece ser nome de pessoa física." };
  }
  if (matchesExcludedBrand(validation.companyName ?? companyName, excludedBrands)) {
    return { ok: false, reason: "A razão social oficial corresponde a uma marca da lista de exclusão." };
  }
  if (isPublicEntityByLegalNature(validation.legalNature) === true) {
    return { ok: false, reason: "A natureza jurídica oficial indica órgão/empresa pública." };
  }
  if (usedCnpjsGlobal.has(validation.cnpj)) {
    return { ok: false, reason: "Este CNPJ já está salvo no banco (a proteção contra repetição é permanente)." };
  }

  return {
    ok: true,
    fields: {
      cnpj: validation.cnpj,
      cnpjFormatted: validation.cnpjFormatted,
      cnpjStatus: validation.statusDescription,
      cnpjLegalNature: validation.legalNature,
      cnpjOfficialCompanyName: validation.companyName,
    },
  };
}

export interface ManualUrlInput {
  companyName: string;
  url: string;
  niche: string;
  cnpj?: string | null;
}

export async function addUrlManually(input: ManualUrlInput): Promise<ManualResult<DomainRecord>> {
  const companyName = input.companyName.trim();
  const niche = input.niche.trim();
  if (!companyName) return { ok: false, reason: "Informe o nome da empresa." };
  if (!niche) return { ok: false, reason: "Informe o nicho." };

  const normalizedDomain = normalizeDomain(input.url);
  if (!normalizedDomain || normalizedDomain.length < 3) {
    return { ok: false, reason: "URL inválida." };
  }

  const excludedBrands = await getExcludedBrandNamesNormalized();
  const usedDomains = await getUsedNormalizedDomains();
  if (usedDomains.has(normalizedDomain)) {
    return { ok: false, reason: "Este domínio já está salvo no banco (a proteção contra repetição é permanente)." };
  }
  if (matchesExcludedBrand(companyName, excludedBrands) || matchesExcludedBrand(normalizedDomain, excludedBrands)) {
    return { ok: false, reason: "Esta empresa/marca está na lista de exclusão." };
  }
  if (looksLikePublicEntityByNameOrDomain(companyName, normalizedDomain)) {
    return { ok: false, reason: "Parece ser um órgão público (pelo nome/domínio)." };
  }

  const validation = await validateUrl(input.url);
  if (!validation.isValid || !validation.finalUrl) {
    return {
      ok: false,
      reason: `A URL não passou na verificação HTTP real${validation.reason ? ` (${validation.reason})` : "."}`,
    };
  }

  const compliance = runComplianceScreening({
    url: validation.finalUrl,
    htmlSnippet: validation.htmlSnippet,
    companyName,
  });
  if (compliance.verdict === "REJECT") {
    return { ok: false, reason: "Sinais evidentes de incompatibilidade com as políticas do Google Ads." };
  }

  let cnpjFields = {
    cnpj: null as string | null,
    cnpjFormatted: null as string | null,
    cnpjStatus: null as string | null,
    cnpjLegalNature: null as string | null,
    cnpjVerified: false,
  };

  if (input.cnpj && input.cnpj.trim()) {
    const usedCnpjsGlobal = new Set([...(await getUsedCnpjs()), ...(await getUsedCnpjsFromDomains())]);
    const cnpjResult = await validateCnpjAgainstRules(companyName, input.cnpj, excludedBrands, usedCnpjsGlobal);
    if (!cnpjResult.ok) {
      return { ok: false, reason: `CNPJ informado não passou na verificação: ${cnpjResult.reason}` };
    }
    cnpjFields = {
      cnpj: cnpjResult.fields.cnpj,
      cnpjFormatted: cnpjResult.fields.cnpjFormatted,
      cnpjStatus: cnpjResult.fields.cnpjStatus,
      cnpjLegalNature: cnpjResult.fields.cnpjLegalNature,
      cnpjVerified: true,
    };
  }

  const saved = await insertDomainIfNew({
    domain: input.url,
    normalizedDomain,
    url: validation.finalUrl,
    companyName,
    niche,
    complianceStatus: compliance.verdict === "PASS_REVIEW" ? "PASS_REVIEW" : "MANUAL_REVIEW",
    sourceNote: "Adicionado manualmente pelo usuário (verificado por HTTP real e, se informado, CNPJ em fonte oficial).",
    ...cnpjFields,
  });

  if (!saved) return { ok: false, reason: "Este domínio já foi salvo por outra requisição ao mesmo tempo." };
  return { ok: true, saved };
}

export interface ManualCnpjInput {
  companyName: string;
  cnpj: string;
  niche: string;
}

export async function addCnpjManually(input: ManualCnpjInput): Promise<ManualResult<CnpjRecord>> {
  const companyName = input.companyName.trim();
  const niche = input.niche.trim();
  if (!companyName) return { ok: false, reason: "Informe o nome da empresa." };
  if (!niche) return { ok: false, reason: "Informe o nicho." };

  const excludedBrands = await getExcludedBrandNamesNormalized();
  if (matchesExcludedBrand(companyName, excludedBrands)) {
    return { ok: false, reason: "Esta empresa/marca está na lista de exclusão." };
  }
  if (looksLikePublicEntityByNameOrDomain(companyName, "")) {
    return { ok: false, reason: "Parece ser um órgão público (pelo nome)." };
  }
  if (looksLikePersonName(companyName)) {
    return { ok: false, reason: "O nome informado parece ser de pessoa física (padrão típico de MEI)." };
  }

  const usedCnpjsGlobal = new Set([...(await getUsedCnpjs()), ...(await getUsedCnpjsFromDomains())]);
  const cnpjResult = await validateCnpjAgainstRules(companyName, input.cnpj, excludedBrands, usedCnpjsGlobal);
  if (!cnpjResult.ok) return { ok: false, reason: cnpjResult.reason };

  const saved = await insertCnpjIfNew({
    cnpj: cnpjResult.fields.cnpj,
    cnpjFormatted: cnpjResult.fields.cnpjFormatted,
    companyName: cnpjResult.fields.cnpjOfficialCompanyName ?? companyName,
    status: cnpjResult.fields.cnpjStatus ?? "Não foi possível verificar este dado.",
    isMei: false,
    legalNature: cnpjResult.fields.cnpjLegalNature,
    niche,
    sourceNote: "Adicionado manualmente pelo usuário (verificado em fonte oficial).",
  });

  if (!saved) return { ok: false, reason: "Este CNPJ já foi salvo por outra requisição ao mesmo tempo." };
  return { ok: true, saved };
}
