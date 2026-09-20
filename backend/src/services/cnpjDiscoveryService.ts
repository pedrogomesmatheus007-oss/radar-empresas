import Anthropic from "@anthropic-ai/sdk";
import { env, isAnthropicConfigured } from "../config/env.js";
import { createLogger } from "../utils/logger.js";
import { DiscoveryNotConfiguredError } from "./discoveryService.js";
import type { CnpjCandidate } from "../types/domain.js";

const logger = createLogger("cnpjDiscoveryService");

export interface SingleCompanyCnpjResult {
  cnpj: string;
  sourceNote: string;
}

export interface CnpjDiscoveryProvider {
  discoverCandidates(params: {
    niche: string;
    excludedBrandNames: string[];
    alreadyKnownCnpjs: string[];
    quantity: number;
  }): Promise<CnpjCandidate[]>;

  /**
   * Busca o CNPJ de UMA empresa específica já encontrada na aba URLs (pedido
   * do usuário: "cada URL um CNPJ também"). Retorna null quando não foi
   * possível encontrar evidência real do CNPJ dessa empresa — nunca inventa.
   */
  discoverCnpjForCompany(params: {
    companyName: string;
    url: string;
  }): Promise<SingleCompanyCnpjResult | null>;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

function buildPrompt(params: {
  niche: string;
  excludedBrandNames: string[];
  alreadyKnownCnpjs: string[];
  quantity: number;
}): string {
  const excluded = params.excludedBrandNames.join(", ") || "(nenhuma)";
  const knownCount = params.alreadyKnownCnpjs.length;

  return `Use a ferramenta de busca na web para encontrar até ${params.quantity} empresas
PRIVADAS e REAIS no nicho "${params.niche}" no Brasil, junto com o número de CNPJ de cada
uma, publicado publicamente (por exemplo no rodapé do site oficial da empresa, em contratos
públicos, ou em plataformas de consulta pública como Consulta CNPJ da própria Receita Federal
via gov.br, sites de transparência, ou o próprio site institucional da empresa).

Regras obrigatórias:
- NUNCA invente um CNPJ. Um CNPJ só deve ser incluído se você encontrou evidência real dele
  na busca. Se não encontrar o CNPJ de uma empresa que parece real, NÃO invente um número —
  simplesmente não inclua essa empresa na lista.
- Não inclua nenhuma destas marcas/grupos: ${excluded}.
- Não inclua órgãos públicos, autarquias, empresas públicas, sociedades de economia mista,
  MEI (Microempreendedor Individual) ou empresas com indícios de estarem inativas/fechadas.
- Prefira empresas cuja razão social tenha um nome empresarial claro (com "Ltda", "EIRELI",
  "S/A", "Comércio", "Indústria" etc.) em vez de razão social que seja apenas o nome de uma
  pessoa física — isso costuma indicar Empresário Individual/MEI mesmo quando o registro não
  deixa isso explícito.
- Já existem ${knownCount} CNPJs nesta base que NUNCA devem se repetir — priorize empresas
  novas e diferentes a cada busca.
- É preferível devolver menos resultados do que arriscar incluir um CNPJ incorreto ou
  inventado.

Ao final da sua resposta, depois de pesquisar, responda SOMENTE com um bloco de código JSON
(sem nenhum texto antes ou depois) no formato exato:

\`\`\`json
[
  { "companyName": "Nome da Empresa Ltda", "cnpj": "12345678000190", "sourceNote": "encontrado via: <onde exatamente você viu esse CNPJ>" }
]
\`\`\`

O campo "cnpj" deve conter apenas os 14 dígitos, sem pontuação. Se não encontrar nenhuma
empresa com CNPJ verificável, responda com um array vazio: []`;
}

function buildSingleCompanyPrompt(params: { companyName: string; url: string }): string {
  return `Use a ferramenta de busca na web para tentar encontrar o número de CNPJ REAL da
empresa "${params.companyName}", cujo site é ${params.url}.

Procure evidência pública do CNPJ dessa empresa específica (rodapé do próprio site, termos de
uso, política de privacidade, contratos públicos, cadastros oficiais, notas fiscais publicadas,
etc.).

Regras obrigatórias:
- NUNCA invente um CNPJ. Se não encontrar evidência real e específica do CNPJ desta empresa,
  responda que não encontrou — não tente "adivinhar" ou usar um CNPJ de empresa parecida.
- Se a empresa parecer ser MEI (Microempreendedor Individual) ou a razão social for apenas um
  nome de pessoa física, responda que não encontrou (não deve ser incluída).

Ao final, responda SOMENTE com um bloco de código JSON (sem texto antes ou depois) em um dos
dois formatos exatos abaixo:

Se encontrou:
\`\`\`json
{ "cnpj": "12345678000190", "sourceNote": "encontrado via: <onde exatamente você viu esse CNPJ>" }
\`\`\`

Se NÃO encontrou (use sempre que não tiver certeza):
\`\`\`json
{ "cnpj": null }
\`\`\``;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const match = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/(\{[\s\S]*\})/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    logger.warn("Falha ao interpretar JSON (objeto único) retornado pelo modelo", { error: String(err) });
    return null;
  }
}

function extractJsonArray(text: string): unknown[] {
  const match = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/(\[[\s\S]*\])/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    logger.warn("Falha ao interpretar JSON retornado pelo modelo", { error: String(err) });
    return [];
  }
}

export class AnthropicCnpjDiscoveryProvider implements CnpjDiscoveryProvider {
  async discoverCandidates(params: {
    niche: string;
    excludedBrandNames: string[];
    alreadyKnownCnpjs: string[];
    quantity: number;
  }): Promise<CnpjCandidate[]> {
    if (!isAnthropicConfigured()) {
      throw new DiscoveryNotConfiguredError();
    }

    const anthropic = getClient();
    const prompt = buildPrompt(params);

    const response = await anthropic.messages.create({
      model: env.anthropicModel,
      max_tokens: 4000,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: env.anthropicWebSearchMaxUses,
        } as unknown as Anthropic.Messages.Tool,
      ],
      messages: [{ role: "user", content: prompt }],
    });

    const textBlocks = response.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const rawCandidates = extractJsonArray(textBlocks);
    const candidates: CnpjCandidate[] = [];
    for (const item of rawCandidates) {
      if (
        item &&
        typeof item === "object" &&
        "companyName" in item &&
        "cnpj" in item &&
        typeof (item as any).companyName === "string" &&
        typeof (item as any).cnpj === "string"
      ) {
        candidates.push({
          companyName: (item as any).companyName.trim(),
          cnpj: (item as any).cnpj.replace(/\D/g, ""),
          sourceNote:
            typeof (item as any).sourceNote === "string"
              ? (item as any).sourceNote
              : "Encontrado via busca na web (Anthropic API)",
        });
      }
    }

    logger.info("Descoberta de CNPJ concluída", { niche: params.niche, candidatos: candidates.length });
    return candidates;
  }

  async discoverCnpjForCompany(params: { companyName: string; url: string }): Promise<SingleCompanyCnpjResult | null> {
    if (!isAnthropicConfigured()) {
      throw new DiscoveryNotConfiguredError();
    }

    const anthropic = getClient();
    const prompt = buildSingleCompanyPrompt(params);

    const response = await anthropic.messages.create({
      model: env.anthropicModel,
      max_tokens: 1500,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: Math.min(env.anthropicWebSearchMaxUses, 3),
        } as unknown as Anthropic.Messages.Tool,
      ],
      messages: [{ role: "user", content: prompt }],
    });

    const textBlocks = response.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const parsed = extractJsonObject(textBlocks);
    if (!parsed || typeof parsed.cnpj !== "string") {
      return null; // não encontrado — nunca inventamos um substituto
    }

    const cnpj = parsed.cnpj.replace(/\D/g, "");
    if (cnpj.length !== 14) return null;

    return {
      cnpj,
      sourceNote:
        typeof parsed.sourceNote === "string" ? parsed.sourceNote : "Encontrado via busca na web (Anthropic API)",
    };
  }
}

export function getCnpjDiscoveryProvider(): CnpjDiscoveryProvider {
  return new AnthropicCnpjDiscoveryProvider();
}
