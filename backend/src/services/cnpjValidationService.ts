import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";
import { isValidCnpjChecksum } from "../utils/cnpjValidator.js";
import { formatCnpj, onlyDigits } from "../utils/textNormalization.js";

const logger = createLogger("cnpjValidationService");

export interface CnpjValidationResult {
  isValid: boolean;
  cnpj: string;
  cnpjFormatted: string;
  companyName: string | null;
  statusDescription: string | null; // ex: "ATIVA" — null se não foi possível verificar
  isActive: boolean | null; // null = não verificado
  isMei: boolean | null; // null = não verificado
  legalNature: string | null; // null = não verificado
  sourceUsed: "brasilapi" | "receitaws" | null;
  reason?: string;
}

function unverified(cnpj: string, reason: string): CnpjValidationResult {
  return {
    isValid: false,
    cnpj,
    cnpjFormatted: safeFormat(cnpj),
    companyName: null,
    statusDescription: null,
    isActive: null,
    isMei: null,
    legalNature: null,
    sourceUsed: null,
    reason,
  };
}

function safeFormat(cnpj: string): string {
  try {
    return formatCnpj(cnpj);
  } catch {
    return cnpj;
  }
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.cnpjValidationTimeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
  } catch (err) {
    logger.debug("Falha de rede ao consultar CNPJ", { url, error: String(err) });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Lê um campo tentando várias chaves possíveis (defensivo, pois o formato
 * exato de resposta da BrasilAPI/ReceitaWS não pôde ser confirmado ao vivo
 * durante a construção deste projeto — ver ARCHITECTURE.md).
 */
function pickField(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

function normalizeBrasilApiResponse(data: Record<string, unknown>, cnpj: string): CnpjValidationResult {
  const companyName = pickField(data, ["razao_social", "nome", "company_name"]);
  const statusDescription = pickField(data, [
    "descricao_situacao_cadastral",
    "situacao_cadastral_texto",
    "situacao",
  ]);
  const legalNatureRaw = pickField(data, ["natureza_juridica", "descricao_natureza_juridica"]);
  const meiRaw = pickField(data, ["opcao_pelo_mei", "mei"]);
  const porte = pickField(data, ["porte", "descricao_porte"]);

  const statusText = typeof statusDescription === "string" ? statusDescription.toUpperCase() : null;
  const isActive = statusText ? statusText.includes("ATIVA") : null;

  let isMei: boolean | null = null;
  if (typeof meiRaw === "boolean") {
    isMei = meiRaw;
  } else if (typeof porte === "string") {
    isMei = porte.toUpperCase().includes("MEI") ? true : isMei;
  }

  return {
    isValid: true,
    cnpj,
    cnpjFormatted: safeFormat(cnpj),
    companyName: typeof companyName === "string" ? companyName : null,
    statusDescription: statusText,
    isActive,
    isMei,
    legalNature: typeof legalNatureRaw === "string" ? legalNatureRaw : null,
    sourceUsed: "brasilapi",
  };
}

function normalizeReceitaWsResponse(data: Record<string, unknown>, cnpj: string): CnpjValidationResult {
  const companyName = pickField(data, ["nome", "razao_social"]);
  const statusDescription = pickField(data, ["situacao"]);
  const legalNatureRaw = pickField(data, ["natureza_juridica"]);
  const atividadePrincipal = pickField(data, ["atividade_principal"]);

  const statusText = typeof statusDescription === "string" ? statusDescription.toUpperCase() : null;
  const isActive = statusText ? statusText.includes("ATIVA") : null;

  // ReceitaWS não expõe um campo explícito de MEI; tentamos inferir pela
  // natureza jurídica (código 213-5 = Empresário Individual, frequentemente
  // associado a MEI, mas isso NÃO é uma confirmação definitiva).
  let isMei: boolean | null = null;
  if (typeof legalNatureRaw === "string") {
    isMei = /213-5|empres[aá]rio individual/i.test(legalNatureRaw) ? null : false;
    // Deixamos null quando há ambiguidade em vez de arriscar um "NÃO" incorreto.
  }

  return {
    isValid: true,
    cnpj,
    cnpjFormatted: safeFormat(cnpj),
    companyName: typeof companyName === "string" ? companyName : null,
    statusDescription: statusText,
    isActive,
    isMei,
    legalNature: typeof legalNatureRaw === "string" ? legalNatureRaw : null,
    sourceUsed: "receitaws",
    reason:
      isMei === null
        ? "Não foi possível confirmar com certeza se é MEI usando esta fonte (campo não exposto pela ReceitaWS)."
        : undefined,
  };
}

/**
 * Valida um CNPJ contra fontes públicas reais. NUNCA retorna dados
 * inventados: se a consulta falhar ou o CNPJ não existir, o resultado indica
 * explicitamente que não foi possível verificar.
 */
export async function validateCnpj(rawCnpj: string): Promise<CnpjValidationResult> {
  const cnpj = onlyDigits(rawCnpj);

  if (!isValidCnpjChecksum(cnpj)) {
    return unverified(cnpj, "CNPJ matematicamente inválido (dígito verificador incorreto).");
  }

  // Fonte primária: BrasilAPI (gratuita, sem chave, espelha dados públicos da Receita Federal)
  const brasilApiResponse = await fetchWithTimeout(`${env.brasilApiCnpjUrl}/${cnpj}`);
  if (brasilApiResponse) {
    if (brasilApiResponse.status === 404) {
      return unverified(cnpj, "CNPJ não encontrado na base pública da Receita Federal (BrasilAPI).");
    }
    if (brasilApiResponse.ok) {
      try {
        const data = (await brasilApiResponse.json()) as Record<string, unknown>;
        return normalizeBrasilApiResponse(data, cnpj);
      } catch (err) {
        logger.warn("Resposta da BrasilAPI não pôde ser interpretada", { error: String(err) });
      }
    }
  }

  // Fallback: ReceitaWS
  const receitaWsResponse = await fetchWithTimeout(`${env.receitaWsCnpjUrl}/${cnpj}`);
  if (receitaWsResponse) {
    if (receitaWsResponse.ok) {
      try {
        const data = (await receitaWsResponse.json()) as Record<string, unknown>;
        if (data.status === "ERROR") {
          return unverified(cnpj, String(data.message ?? "CNPJ não encontrado (ReceitaWS)."));
        }
        return normalizeReceitaWsResponse(data, cnpj);
      } catch (err) {
        logger.warn("Resposta da ReceitaWS não pôde ser interpretada", { error: String(err) });
      }
    }
  }

  return unverified(
    cnpj,
    "Não foi possível verificar este registro nas fontes disponíveis (BrasilAPI e ReceitaWS indisponíveis ou fora do ar)."
  );
}
