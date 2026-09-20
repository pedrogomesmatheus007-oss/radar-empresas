import { onlyDigits } from "./textNormalization.js";

/**
 * Valida matematicamente um CNPJ (dígitos verificadores, módulo 11).
 * Isso NÃO confirma que a empresa existe de fato — apenas que o número é
 * estruturalmente válido. A existência real é confirmada em
 * cnpjValidationService via consulta a fonte oficial/pública.
 */
export function isValidCnpjChecksum(rawCnpj: string): boolean {
  const cnpj = onlyDigits(rawCnpj);
  if (cnpj.length !== 14) return false;

  // Rejeita sequências de dígitos repetidos (ex: 00000000000000), que passam
  // matematicamente mas nunca são CNPJs reais.
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcCheckDigit = (base: string): number => {
    const weights =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base
      .split("")
      .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const base12 = cnpj.slice(0, 12);
  const digit1 = calcCheckDigit(base12);
  const digit2 = calcCheckDigit(base12 + digit1);

  return cnpj === base12 + String(digit1) + String(digit2);
}
