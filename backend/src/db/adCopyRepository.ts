import { getPool } from "./database.js";
import type { AdCopyRecord } from "../types/domain.js";

interface Row {
  id: number;
  niche: string;
  title: string;
  description: string;
  created_at: string;
}

function toRecord(row: Row): AdCopyRecord {
  return {
    id: row.id,
    niche: row.niche,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
  };
}

export async function getAdCopyForNiche(niche: string): Promise<AdCopyRecord | null> {
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM ad_copy WHERE niche = $1 LIMIT 1", [niche]);
  if (rows.length === 0) return null;
  return toRecord(rows[0] as Row);
}

/**
 * Cria ou substitui o anúncio salvo para um nicho (ON CONFLICT DO UPDATE,
 * já que aqui — ao contrário de domains/cnpjs — QUEREMOS permitir
 * regenerar/atualizar o texto do mesmo nicho, não é um dado que nunca muda).
 */
export async function upsertAdCopy(niche: string, title: string, description: string): Promise<AdCopyRecord> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO ad_copy (niche, title, description, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (niche) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       created_at = EXCLUDED.created_at
     RETURNING *`,
    [niche, title, description, new Date().toISOString()]
  );
  return toRecord(rows[0] as Row);
}
