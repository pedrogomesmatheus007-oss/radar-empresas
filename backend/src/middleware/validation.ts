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

export function validateBody<T extends z.ZodTypeAny>(schema: T): RequestHandler {
  return (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
}
