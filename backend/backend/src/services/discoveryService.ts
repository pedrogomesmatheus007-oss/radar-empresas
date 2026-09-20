import Anthropic from "@anthropic-ai/sdk";
import { env, isAnthropicConfigured } from "../config/env.js";
import { createLogger } from "../utils/logger.js";
import type { CompanyCandidate } from "../types/domain.js";

const logger = createLogger("discoveryService");

export class DiscoveryNotConfiguredError extends Error {
  constructor() {
    super(
      "A busca de empresas não está configurada: defina ANTHROPIC_API_KEY no arquivo .env do backend. " +
        "O sistema não inventa resultados quando a fonte de busca não está disponível."
    );
    this.name = "DiscoveryNotConfiguredError";
  }
}

/** Interface plugável — permite substituir por outra fonte de busca (ex: Google Custom Search) sem tocar no resto do pipeline. */
export interface CompanyDiscoveryProvider {
  discoverCandidates(params: {
    niche: string;
    excludedBrandNames: string[];
    alreadyKnownDomains: string[];
    quantity: number;
  }): Promise<CompanyCandidate[]>;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return client;
}

function buildPrompt(params: {
  niche: string;
  excludedBrandNames: string[];
  alreadyKnownDomains: string[];
  quantity: number;
}): string {
  const excluded = params.excludedBrandNames.join(", ") || "(nenhuma)";
  const known = params.alreadyKnownDomains.slice(0, 200).join(", ") || "(nenhum ainda)";

  return `Use a ferramenta de busca na web para encontrar até ${params.quantity} empresas
PRIVADAS e REAIS que atuam no nicho "${params.niche}" no Brasil, cada uma com um site
comercial próprio (não perfil de rede social, não marketplace, não portal de notícias).

Regras obrigatórias:
- NUNCA invente uma empresa, domínio ou URL. Só inclua um resultado se você encontrou
  evidência real dele na busca (uma página, um resultado de busca, um diretório).
- Não inclua nenhuma destas marcas/grupos (e suas subsidiárias óbvias): ${excluded}.
- Não inclua grandes marketplaces (Mercado Livre, Shopee, Amazon, Alibaba, OLX, etc.),
  redes sociais, ou portais de notícias/blogs genéricos.
- Não inclua órgãos públicos, autarquias, empresas públicas ou sociedades de economia mista
  (ex: domínios .gov.br, .leg.br, .jus.br, ou nomes claramente de prefeituras/secretarias/
  autarquias/Correios/bancos públicos como Caixa, BB quando atuando como órgão).
- Prefira empresas de pequeno/médio porte, pois é mais provável que sejam privadas e
  ainda não tenham sido usadas nesta lista.
- NÃO repita nenhum destes domínios, que já foram apresentados antes: ${known}.
- Se você não tiver certeza de que uma empresa/URL é real, NÃO a inclua — é melhor
  devolver menos resultados do que arriscar um dado inventado.

Além disso, PARA CADA empresa que você incluir, aproveite a mesma pesquisa (sem fazer
buscas extras separadas) para tentar identificar o CNPJ dela, olhando fontes como o
rodapé do próprio site, termos de uso, política de privacidade ou cadastros públicos.
- Só preencha o campo "cnpj" se você encontrou evidência real e específica do CNPJ
  DAQUELA empresa. NUNCA invente um CNPJ nem reaproveite o de outra empresa parecida.
- Se não encontrar o CNPJ com essa mesma pesquisa, deixe "cnpj" como null — isso é
  normal e aceitável, a empresa ainda assim deve ser incluída pela URL.

Ao final da sua resposta, depois de pesquisar, responda SOMENTE com um bloco de código
JSON (sem nenhum texto antes ou depois dele) no seguinte formato exato:

\`\`\`json
[
  {
    "companyName": "Nome da Empresa Ltda",
    "url": "https://dominio-real.com.br",
    "sourceNote": "encontrado via busca: <breve descrição de onde/como>",
    "cnpj": "12345678000190",
    "cnpjSourceNote": "encontrado via: <onde exatamente viu o CNPJ, ou null se não encontrou>"
  }
]
\`\`\`

O campo "cnpj" deve ter apenas os 14 dígitos sem pontuação, ou ser null quando não encontrado.
Se não encontrar nenhuma empresa que atenda a todos os critérios, responda com um array vazio: []`;
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

export class AnthropicCompanyDiscoveryProvider implements CompanyDiscoveryProvider {
  async discoverCandidates(params: {
    niche: string;
    excludedBrandNames: string[];
    alreadyKnownDomains: string[];
    quantity: number;
  }): Promise<CompanyCandidate[]> {
    if (!isAnthropicConfigured()) {
      throw new DiscoveryNotConfiguredError();
    }

    const anthropic = getClient();
    const prompt = buildPrompt(params);

    const response = await anthropic.messages.create({
      model: env.anthropicDiscoveryModel,
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

    const candidates: CompanyCandidate[] = [];
    for (const item of rawCandidates) {
      if (
        item &&
        typeof item === "object" &&
        "companyName" in item &&
        "url" in item &&
        typeof (item as any).companyName === "string" &&
        typeof (item as any).url === "string"
      ) {
        const rawCnpj = (item as any).cnpj;
        const cnpjDigits = typeof rawCnpj === "string" ? rawCnpj.replace(/\D/g, "") : "";
        candidates.push({
          companyName: (item as any).companyName.trim(),
          url: (item as any).url.trim(),
          sourceNote:
            typeof (item as any).sourceNote === "string"
              ? (item as any).sourceNote
              : "Encontrado via busca na web (Anthropic API)",
          cnpj: cnpjDigits.length === 14 ? cnpjDigits : null,
          cnpjSourceNote:
            typeof (item as any).cnpjSourceNote === "string" ? (item as any).cnpjSourceNote : null,
        });
      }
    }

    logger.info("Descoberta concluída", { niche: params.niche, candidatos: candidates.length });
    return candidates;
  }
}

export function getCompanyDiscoveryProvider(): CompanyDiscoveryProvider {
  return new AnthropicCompanyDiscoveryProvider();
}
