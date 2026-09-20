/**
 * Heurísticas para identificar, quando possível, se uma empresa/domínio é um
 * órgão público, autarquia, empresa pública ou sociedade de economia mista.
 *
 * Importante (regra #5 do briefing): NÃO assumir que uma empresa é pública só
 * pelo nome. Estas heurísticas servem para eliminar casos ÓBVIOS antes mesmo
 * da verificação de URL/CNPJ. A confirmação mais confiável, quando disponível,
 * vem do campo "natureza jurídica" retornado pela consulta oficial de CNPJ:
 * códigos que começam com "1" no Concla/CNAE representam "Administração
 * Pública" (ex: 101-5 Órgão Público do Poder Executivo Federal, 104-0
 * Autarquia, 116-1 Empresa Pública, 118-8 Economia Mista) — nesse caso a
 * eliminação é uma confirmação de fonte oficial, não um chute pelo nome.
 */

const DOMAIN_SUFFIX_DENYLIST = [".gov.br", ".leg.br", ".jus.br", ".mp.br", ".def.br"];

const NAME_KEYWORDS_DENYLIST = [
  "prefeitura",
  "governo do estado",
  "governo federal",
  "ministério",
  "secretaria de estado",
  "secretaria municipal",
  "câmara municipal",
  "assembleia legislativa",
  "autarquia",
  "sociedade de economia mista",
  "empresa pública",
  "tribunal de justiça",
  "tribunal regional",
  "polícia federal",
  "polícia civil",
  "polícia militar",
  "correios", // Empresa Brasileira de Correios e Telégrafos — empresa pública federal
];

export function looksLikePublicEntityByNameOrDomain(companyName: string, domain: string): boolean {
  const lowerDomain = domain.toLowerCase();
  if (DOMAIN_SUFFIX_DENYLIST.some((suffix) => lowerDomain.endsWith(suffix))) {
    return true;
  }
  const lowerName = companyName.toLowerCase();
  return NAME_KEYWORDS_DENYLIST.some((keyword) => lowerName.includes(keyword));
}

/**
 * Interpreta o campo "natureza jurídica" (quando confirmado por fonte oficial
 * de CNPJ) para decidir se a entidade é da Administração Pública.
 * Retorna null quando o dado não permite conclusão confiável.
 */
export function isPublicEntityByLegalNature(legalNature: string | null): boolean | null {
  if (!legalNature) return null;
  const match = legalNature.match(/^(\d{3})-?\d?/);
  if (!match) {
    // Sem código numérico reconhecível — tenta por palavras-chave conhecidas.
    const lower = legalNature.toLowerCase();
    if (
      lower.includes("órgão público") ||
      lower.includes("autarquia") ||
      lower.includes("empresa pública") ||
      lower.includes("economia mista") ||
      lower.includes("administração pública")
    ) {
      return true;
    }
    return null;
  }
  const code = match[1];
  // Faixa 101-199 do CONCLA = Administração Pública (inclui autarquias,
  // empresas públicas e sociedades de economia mista).
  const codeNumber = Number(code);
  if (codeNumber >= 101 && codeNumber <= 199) {
    return true;
  }
  return false;
}
