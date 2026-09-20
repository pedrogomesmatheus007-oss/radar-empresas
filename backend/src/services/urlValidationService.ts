import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";
import { ensureProtocol } from "../utils/textNormalization.js";

const logger = createLogger("urlValidationService");

export interface UrlValidationResult {
  isValid: boolean;
  finalUrl: string | null;
  statusCode: number | null;
  contentType: string | null;
  htmlSnippet: string | null; // primeiros bytes do HTML, usado pelo complianceService
  reason?: string;
}

const BROWSER_LIKE_USER_AGENT =
  "Mozilla/5.0 (compatible; RadarDeEmpresasBot/1.0; +verificacao-de-url)";

/**
 * Faz uma verificação HTTP/HTTPS real da URL antes de qualquer resultado ser
 * apresentado. Se o domínio não responder, não puder ser resolvido, ou
 * devolver um erro de servidor, a URL é considerada inválida e NUNCA deve ser
 * mostrada ao usuário como resultado.
 */
export async function validateUrl(rawUrl: string): Promise<UrlValidationResult> {
  const url = ensureProtocol(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.urlValidationTimeoutMs);

  try {
    let response = await safeFetch(url, "HEAD", controller.signal);

    // Alguns servidores não implementam HEAD corretamente (405/501) — nesse
    // caso tentamos um GET real antes de descartar a URL.
    if (!response || response.status === 405 || response.status === 501) {
      response = await safeFetch(url, "GET", controller.signal);
    }

    if (!response) {
      return {
        isValid: false,
        finalUrl: null,
        statusCode: null,
        contentType: null,
        htmlSnippet: null,
        reason: "Não foi possível conectar ao domínio (timeout ou erro de rede).",
      };
    }

    if (response.status >= 400) {
      return {
        isValid: false,
        finalUrl: response.url,
        statusCode: response.status,
        contentType: response.headers.get("content-type"),
        htmlSnippet: null,
        reason: `Servidor respondeu com status ${response.status}.`,
      };
    }

    const contentType = response.headers.get("content-type");
    let htmlSnippet: string | null = null;

    // Se o HEAD não trouxe corpo (a maioria não traz), fazemos um GET limitado
    // para poder analisar o conteúdo básico da página (usado na triagem).
    if (response.headers.get("content-length") === null || contentType?.includes("text/html")) {
      const getResponse = await safeFetch(url, "GET", controller.signal);
      if (getResponse && getResponse.ok) {
        const text = await getResponse.text().catch(() => "");
        htmlSnippet = text.slice(0, 20_000);
        return {
          isValid: true,
          finalUrl: getResponse.url,
          statusCode: getResponse.status,
          contentType: getResponse.headers.get("content-type"),
          htmlSnippet,
        };
      }
    }

    return {
      isValid: true,
      finalUrl: response.url,
      statusCode: response.status,
      contentType,
      htmlSnippet,
    };
  } catch (err) {
    logger.debug("Falha ao validar URL", { url, error: String(err) });
    return {
      isValid: false,
      finalUrl: null,
      statusCode: null,
      contentType: null,
      htmlSnippet: null,
      reason: "Não foi possível conectar ao domínio (timeout ou erro de rede).",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function safeFetch(url: string, method: "HEAD" | "GET", signal: AbortSignal): Promise<Response | null> {
  try {
    return await fetch(url, {
      method,
      redirect: "follow",
      signal,
      headers: { "User-Agent": BROWSER_LIKE_USER_AGENT },
    });
  } catch {
    return null;
  }
}
