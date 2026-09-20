/**
 * Heurística para identificar razões sociais que parecem ser apenas o nome de
 * uma pessoa física — padrão típico de MEI (Microempreendedor Individual) e
 * de Empresário Individual sem nome fantasia registrado (ex: "MARIA DA SILVA
 * SANTOS 04521879000110").
 *
 * Isso é um critério ADICIONAL ao campo oficial `opcao_pelo_mei`: o pedido do
 * usuário foi que, mesmo quando a fonte de CNPJ não confirmar com certeza se
 * é MEI (campo ausente ou nulo — ver cnpjValidationService.ts), o sistema
 * ainda assim evite mostrar razões sociais com essa cara de nome pessoal.
 *
 * Como qualquer heurística por nome, ela pode ter falsos positivos (uma ME
 * cujo nome fantasia coincide com um nome próprio, por exemplo) — por isso é
 * tratada como preferência/filtro adicional, não como fonte de verdade sobre
 * a natureza jurídica real da empresa.
 */

const LEGAL_ENTITY_MARKERS = [
  "LTDA",
  "EIRELI",
  " ME",
  "M.E.",
  " EPP",
  "S/A",
  "S.A",
  "SA ",
  "SOCIEDADE",
  "COMERCIO",
  "COMÉRCIO",
  "COMERCIAL",
  "INDUSTRIA",
  "INDÚSTRIA",
  "INDUSTRIAL",
  "SERVICOS",
  "SERVIÇOS",
  "COOPERATIVA",
  "ASSOCIACAO",
  "ASSOCIAÇÃO",
  "CIA",
  "COMPANHIA",
  "GRUPO",
  "DISTRIBUIDORA",
  "DISTRIBUIDORA",
  "REPRESENTACOES",
  "REPRESENTAÇÕES",
  "EMPREENDIMENTOS",
  "PARTICIPACOES",
  "PARTICIPAÇÕES",
  "HOLDING",
  "IMPORT",
  "EXPORT",
  "ATACADO",
  "VAREJO",
  "FABRICA",
  "FÁBRICA",
];

/**
 * Retorna true quando a razão social não contém nenhum marcador típico de
 * pessoa jurídica e tem o formato de um nome próprio (2 a 5 palavras, todas
 * alfabéticas — sem números, sem pontuação incomum).
 */
export function looksLikePersonName(razaoSocial: string): boolean {
  const upper = razaoSocial.toUpperCase();

  const hasLegalMarker = LEGAL_ENTITY_MARKERS.some((marker) => upper.includes(marker));
  if (hasLegalMarker) return false;

  // CNPJ/CPF embutido no texto (comum em razão social de MEI) — sinal forte.
  if (/\d/.test(razaoSocial)) return true;

  const words = razaoSocial.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;

  const allWordsLookLikeNameParts = words.every((word) => /^[A-Za-zÀ-ÖØ-öø-ÿ.'-]+$/.test(word));
  return allWordsLookLikeNameParts;
}
