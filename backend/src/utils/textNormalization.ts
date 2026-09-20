/**
 * Normaliza o domínio de uma URL para um identificador único, tratando
 * http/https e presença/ausência de "www." como o MESMO domínio.
 *
 * Exemplos que devem gerar o mesmo identificador "empresa.com.br":
 *   http://empresa.com.br
 *   https://empresa.com.br
 *   https://www.empresa.com.br
 *   http://www.empresa.com.br
 *   EMPRESA.COM.BR/ (com barra final, maiúsculas)
 */
export function normalizeDomain(rawUrl: string): string {
  let candidate = rawUrl.trim();
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let hostname: string;
  try {
    hostname = new URL(candidate).hostname;
  } catch {
    // Se não for uma URL válida, tenta extrair manualmente o "host" antes da primeira barra.
    hostname = candidate.replace(/^https?:\/\//i, "").split("/")[0];
  }

  hostname = hostname.toLowerCase().trim();
  if (hostname.startsWith("www.")) {
    hostname = hostname.slice(4);
  }
  // remove porta, se houver (ex: empresa.com.br:8080)
  hostname = hostname.split(":")[0];

  return hostname;
}

/**
 * Garante que uma URL tenha protocolo explícito (https por padrão) para que
 * as checagens HTTP funcionem de forma previsível.
 */
export function ensureProtocol(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Normaliza nomes de marcas para comparação (usado na lista de exclusão),
 * removendo acentos, caixa e espaços redundantes.
 */
export function normalizeBrandName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Remove tudo que não for dígito de uma string (usado para CNPJ).
 */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Formata um CNPJ de 14 dígitos como 00.000.000/0000-00.
 * Lança erro se não tiver exatamente 14 dígitos.
 */
export function formatCnpj(digits: string): string {
  const clean = onlyDigits(digits);
  if (clean.length !== 14) {
    throw new Error(`CNPJ inválido para formatação: "${digits}" não tem 14 dígitos.`);
  }
  return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}
