import { getPool } from "./database.js";
import { env } from "../config/env.js";
import type { SearchRecord, SearchType } from "../types/domain.js";

interface Row {
  id: number;
  type: string;
  query: string;
  requested_quantity: number;
  result_quantity: number;
  created_at: string;
}

function toRecord(row: Row): SearchRecord {
  return {
    id: row.id,
    type: row.type as SearchType,
    query: row.query,
    requestedQuantity: row.requested_quantity,
    resultQuantity: row.result_quantity,
    createdAt: row.created_at,
  };
}

export async function recordSearch(input: {
  type: SearchType;
  query: string;
  requestedQuantity: number;
  resultQuantity: number;
}): Promise<SearchRecord> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO searches (type, query, requested_quantity, result_quantity, created_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.type, input.query, input.requestedQuantity, input.resultQuantity, new Date().toISOString()]
  );
  return toRecord(rows[0] as Row);
}

/**
 * Retorna somente as pesquisas dentro da janela de retenção (padrão 20 dias).
 * IMPORTANTE: isso é só uma VIEW. Pesquisas fora da janela continuam existindo
 * na tabela `searches` e, mais importante, os domínios/CNPJs que elas geraram
 * continuam para sempre nas tabelas `domains`/`cnpjs` — a proteção contra
 * repetição nunca é afetada por essa retenção.
 */
export async function listRecentSearches(
  retentionDays = env.recentSearchesRetentionDays
): Promise<SearchRecord[]> {
  const pool = getPool();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const { rows } = await pool.query(
    "SELECT * FROM searches WHERE created_at >= $1 ORDER BY created_at DESC",
    [cutoff]
  );
  return (rows as Row[]).map(toRecord);
}

export async function countSearchesInWindow(retentionDays = env.recentSearchesRetentionDays): Promise<number> {
  return (await listRecentSearches(retentionDays)).length;
}
