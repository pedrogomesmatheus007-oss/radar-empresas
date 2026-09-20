export type ComplianceStatus = "PASS_REVIEW" | "MANUAL_REVIEW" | "REJECT";

export interface DomainRecord {
  id: number;
  domain: string;
  normalizedDomain: string;
  url: string;
  companyName: string;
  niche: string;
  complianceStatus: ComplianceStatus;
  sourceNote: string | null;
  /** Emparelhamento opcional com um CNPJ real da mesma empresa (ver urlSearchOrchestrator). */
  cnpj: string | null;
  cnpjFormatted: string | null;
  cnpjStatus: string | null;
  cnpjLegalNature: string | null;
  cnpjVerified: boolean;
  firstSeenAt: string;
}

export interface CnpjRecord {
  id: number;
  cnpj: string;
  cnpjFormatted: string;
  companyName: string;
  status: string;
  isMei: boolean;
  legalNature: string | null;
  niche: string;
  sourceNote: string | null;
  firstSeenAt: string;
}

export type SearchType = "urls" | "cnpj";

export interface SearchRecord {
  id: number;
  type: SearchType;
  query: string;
  requestedQuantity: number;
  resultQuantity: number;
  createdAt: string;
}

export interface ExcludedBrandRecord {
  id: number;
  name: string;
  normalizedName: string;
  createdAt: string;
}

/** Candidato bruto retornado pela descoberta (Anthropic), ainda não verificado. */
export interface CompanyCandidate {
  companyName: string;
  url: string;
  sourceNote?: string;
  /**
   * CNPJ opcional já encontrado NA MESMA busca (economiza uma chamada extra
   * de IA por empresa). Só deve vir preenchido quando o modelo encontrou
   * evidência real; null/ausente significa "não encontrado nesta busca" —
   * nunca é tratado como convite para inventar.
   */
  cnpj?: string | null;
  cnpjSourceNote?: string | null;
}

export interface CnpjCandidate {
  companyName: string;
  cnpj: string;
  sourceNote?: string;
}
