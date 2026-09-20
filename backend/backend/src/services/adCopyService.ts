import Anthropic from "@anthropic-ai/sdk";
import { env, isAnthropicConfigured } from "../config/env.js";
import { createLogger } from "../utils/logger.js";
import { getAdCopyForNiche, upsertAdCopy } from "../db/adCopyRepository.js";
import type { AdCopyRecord } from "../types/domain.js";

const logger = createLogger("adCopyService");

const TITLE_LIMIT = 30;
const DESCRIPTION_LIMIT = 90;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

/**
 * Corta o texto no limite de caracteres do Google Ads, tentando não cortar
 * no meio de uma palavra (corta no último espaço antes do limite, quando
 * isso não deixaria o texto curto demais). É uma rede de segurança — o
 * prompt já pede o tamanho certo — para GARANTIR que nunca ultrapassa.
 */
function truncateToLimit(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  const cut = trimmed.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

function buildPrompt(niche: string): string {
  return `Crie um título e uma descrição de anúncio para o Google Ads, em português do Brasil,
para empresas do nicho "${niche}".

Regras obrigatórias:
- O texto deve ser genérico para o NICHO como categoria, sem citar nome de
  nenhuma empresa específica (isto não é sobre uma empresa real, é um modelo
  que qualquer empresa desse ramo poderia usar).
- "title" deve ter NO MÁXIMO ${TITLE_LIMIT} caracteres, contando espaços e pontuação.
- "description" deve ter NO MÁXIMO ${DESCRIPTION_LIMIT} caracteres, contando espaços e pontuação.
- Linguagem persuasiva, mas sem promessas exageradas, enganosas ou sensacionalistas.

Responda SOMENTE com um bloco de código JSON, sem nenhum texto antes ou depois:

\`\`\`json
{ "title": "...", "description": "..." }
\`\`\``;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const match = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/(\{[\s\S]*\})/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    logger.warn("Falha ao interpretar JSON de anúncio retornado pelo modelo", { error: String(err) });
    return null;
  }
}

/**
 * Gera título + descrição SEM usar a ferramenta de busca na web — é só
 * geração de texto (copywriting genérico para a categoria), bem mais barato
 * do que as buscas de URL/CNPJ. Diferente de CNPJ/URL, não há um fato para
 * verificar aqui, então a regra de "nunca inventar dado" não se aplica da
 * mesma forma: isto é uma sugestão de anúncio, não uma alegação sobre uma
 * empresa específica.
 */
async function generateAdCopyViaAnthropic(niche: string): Promise<{ title: string; description: string }> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: env.anthropicDiscoveryModel,
    max_tokens: 300,
    messages: [{ role: "user", content: buildPrompt(niche) }],
  });

  const textBlocks = response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const parsed = extractJsonObject(textBlocks);
  const rawTitle = typeof parsed?.title === "string" ? parsed.title : niche;
  const rawDescription =
    typeof parsed?.description === "string"
      ? parsed.description
      : `Encontre empresas de ${niche} perto de você.`;

  return {
    title: truncateToLimit(rawTitle, TITLE_LIMIT),
    description: truncateToLimit(rawDescription, DESCRIPTION_LIMIT),
  };
}

/**
 * Retorna o anúncio já salvo para o nicho, se existir; caso contrário gera
 * um novo (1 chamada de IA sem busca na web) e salva, para nunca precisar
 * gerar de novo para o mesmo nicho. Best-effort: se a IA não estiver
 * configurada ou a chamada falhar, retorna null em vez de travar a busca
 * principal de URLs/CNPJs que chamou esta função.
 */
export async function ensureAdCopyForNiche(niche: string): Promise<AdCopyRecord | null> {
  const cleanNiche = niche.trim();
  if (!cleanNiche) return null;

  const existing = await getAdCopyForNiche(cleanNiche);
  if (existing) return existing;

  if (!isAnthropicConfigured()) return null;

  try {
    const { title, description } = await generateAdCopyViaAnthropic(cleanNiche);
    return await upsertAdCopy(cleanNiche, title, description);
  } catch (err) {
    logger.debug("Não foi possível gerar anúncio para o nicho", { niche: cleanNiche, error: String(err) });
    return null;
  }
}
