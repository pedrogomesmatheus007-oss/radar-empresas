import { z } from "zod";
import type { RequestHandler } from "express";

export const searchRequestSchema = z.object({
  niche: z
    .string()
    .trim()
    .min(2, "O nicho precisa ter pelo menos 2 caracteres.")
    .max(120, "O nicho é longo demais (máximo 120 caracteres)."),
  quantity: z
    .number({ invalid_type_error: "Quantidade deve ser um número." })
    .int("Quantidade deve ser um número inteiro.")
    .min(1, "Quantidade mínima é 1.")
    .max(100, "Quantidade máxima por busca é 100."),
});

export const excludedBrandSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da marca.")
    .max(200, "Nome da marca é longo demais."),
});

// Modo "adicionar manualmente" (custo zero — sem IA): o usuário já achou a
// URL/CNPJ sozinho, então aqui só validamos formato básico de entrada; toda a
// verificação de fato (HTTP real, CNPJ em fonte oficial, regras obrigatórias)
// acontece depois em manualEntryService.ts.
export const manualUrlSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(1, "Informe o nome da empresa.")
    .max(200, "Nome da empresa é longo demais."),
  url: z
    .string()
    .trim()
    .min(3, "Informe a URL do site.")
    .max(500, "URL é longa demais."),
  niche: z
    .string()
    .trim()
    .min(2, "O nicho precisa ter pelo menos 2 caracteres.")
    .max(120, "O nicho é longo demais (máximo 120 caracteres)."),
  cnpj: z
    .string()
    .trim()
    .max(30, "CNPJ é longo demais.")
    .optional()
    .nullable(),
});

export const manualCnpjSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(1, "Informe o nome da empresa.")
    .max(200, "Nome da empresa é longo demais."),
  cnpj: z
    .string()
    .trim()
    .min(11, "Informe o CNPJ.")
    .max(30, "CNPJ é longo demais."),
  niche: z
    .string()
    .trim()
    .min(2, "O nicho precisa ter pelo menos 2 caracteres.")
    .max(120, "O nicho é longo demais (máximo 120 caracteres)."),
});

export function validateBody<T extends z.ZodTypeAny>(schema: T): RequestHandler {
  return (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
}
