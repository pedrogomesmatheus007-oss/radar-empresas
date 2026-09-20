/**
 * complianceService
 * ------------------
 * Serviço ISOLADO de triagem de conformidade com as políticas públicas do
 * Google Ads. Ele NUNCA declara um site "aprovado" — apenas sinaliza se foram
 * encontrados indícios evidentes de incompatibilidade numa análise automática
 * e superficial do conteúdo textual da página.
 *
 * Resultado possível:
 *   - PASS_REVIEW    → nenhum sinal evidente encontrado ("APTO PARA REVISÃO")
 *   - MANUAL_REVIEW  → sinais ambíguos, requer revisão humana ("REVISÃO NECESSÁRIA")
 *   - REJECT         → sinais fortes de incompatibilidade grave (descartado, nunca mostrado)
 *
 * Categorias usadas (fonte: páginas oficiais de Central de Políticas do Google
 * Ads, consultadas em 19/09/2026):
 *   - "Políticas do Google Ads" — support.google.com/adspolicy/answer/6008942
 *   - "Conteúdo inadequado" — support.google.com/adspolicy/answer/6015406
 * Essas páginas mudam com o tempo; revise periodicamente as listas abaixo.
 */

export type ComplianceVerdict = "PASS_REVIEW" | "MANUAL_REVIEW" | "REJECT";

export interface ComplianceInput {
  url: string;
  htmlSnippet: string | null;
  companyName: string;
}

export interface ComplianceResult {
  verdict: ComplianceVerdict;
  label: "APTO PARA REVISÃO" | "REVISÃO NECESSÁRIA";
  signals: string[];
  sourcesConsulted: string[];
}

const REJECT_KEYWORDS: { pattern: RegExp; label: string }[] = [
  // Conteúdo proibido: produtos falsificados
  { pattern: /\breplica(s)?\b|\bfake\b.*\b(bolsa|relogio|tenis)\b|\b1:1\b.*original/i, label: "Possível produto falsificado/réplica" },
  // Conteúdo proibido: produtos ou serviços perigosos
  { pattern: /\barmas de fogo\b|\bmuni(c|ç)[aã]o\b|\bexplosivos\b|\bdrogas il[ií]citas\b|\bsubst[aâ]ncias controladas\b/i, label: "Produto/serviço potencialmente perigoso ou ilegal" },
  // Facilitação de práticas desonestas
  { pattern: /\bhackear\b|\bspyware\b|\bnotas fiscais frias\b|\bdocumentos falsos\b|\bdiploma sem estudar\b/i, label: "Possível facilitação de prática desonesta" },
  // Conteúdo adulto explícito / exploração
  { pattern: /\bconte[uú]do adulto\b|\bpornografia\b|\bacompanhantes\b|\bcam girls?\b|\bsexo expl[ií]cito\b/i, label: "Conteúdo adulto/sexual explícito" },
  // Phishing / fraude evidente
  { pattern: /\bconfirme sua senha\b.*\burgente\b|\bsua conta ser[aá] bloqueada\b|\bclique aqui para n[aã]o perder\b.*\bprêmio\b/i, label: "Padrão textual comum em phishing/fraude" },
  // Discurso de ódio
  { pattern: /\bsupremacia (branca|racial)\b|\bincitar[a-z]* [oó]dio\b/i, label: "Possível discurso de ódio" },
];

const MANUAL_REVIEW_KEYWORDS: { pattern: RegExp; label: string }[] = [
  // Restritos: bebidas alcoólicas
  { pattern: /\bbebidas? alco[oó]lic[oa]s?\b|\bcervejaria\b|\bdestilaria\b|\bwhisky\b|\bvinhos?\b/i, label: "Categoria restrita: bebidas alcoólicas" },
  // Restritos: jogos de azar
  { pattern: /\bapostas esportivas\b|\bcassino online\b|\bjogos de azar\b|\bbet\b.*\bapostas\b/i, label: "Categoria restrita: jogos de azar/apostas" },
  // Restritos: saúde e medicamentos
  { pattern: /\bfarm[aá]cia online\b|\bmedicamentos controlados\b|\bsuplementos? hormon(al|ais)\b|\banabolizantes\b/i, label: "Categoria restrita: saúde e medicamentos" },
  // Restritos: produtos e serviços financeiros / criptomoedas
  { pattern: /\bempr[eé]stimo r[aá]pido\b|\bcredito f[aá]cil sem consulta\b|\bcriptomoedas?\b|\btrading de bitcoin\b|\bforex\b/i, label: "Categoria restrita: produtos financeiros/criptomoedas" },
  // Restritos: encontros e acompanhantes (versão mais branda que o REJECT acima)
  { pattern: /\bsite de relacionamentos\b|\bencontros? online\b/i, label: "Categoria restrita: encontros online" },
  // Requisitos legais / dados cadastrais insuficientes
  { pattern: /^$|^\s*$/,label: "Conteúdo insuficiente para análise" },
];

const MIN_CONTENT_LENGTH_FOR_CONFIDENT_PASS = 200;

export function runComplianceScreening(input: ComplianceInput): ComplianceResult {
  const sourcesConsulted = [
    "https://support.google.com/adspolicy/answer/6008942 (Políticas do Google Ads)",
    "https://support.google.com/adspolicy/answer/6015406 (Conteúdo inadequado)",
  ];

  const text = (input.htmlSnippet ?? "").replace(/<[^>]+>/g, " ");
  const signals: string[] = [];

  for (const rule of REJECT_KEYWORDS) {
    if (rule.pattern.test(text) || rule.pattern.test(input.companyName)) {
      signals.push(rule.label);
    }
  }
  if (signals.length > 0) {
    return { verdict: "REJECT", label: "REVISÃO NECESSÁRIA", signals, sourcesConsulted };
  }

  const manualSignals: string[] = [];
  for (const rule of MANUAL_REVIEW_KEYWORDS) {
    if (rule.label === "Conteúdo insuficiente para análise") {
      if (text.trim().length < MIN_CONTENT_LENGTH_FOR_CONFIDENT_PASS) {
        manualSignals.push(rule.label);
      }
      continue;
    }
    if (rule.pattern.test(text) || rule.pattern.test(input.companyName)) {
      manualSignals.push(rule.label);
    }
  }

  if (manualSignals.length > 0) {
    return { verdict: "MANUAL_REVIEW", label: "REVISÃO NECESSÁRIA", signals: manualSignals, sourcesConsulted };
  }

  return { verdict: "PASS_REVIEW", label: "APTO PARA REVISÃO", signals: [], sourcesConsulted };
}
