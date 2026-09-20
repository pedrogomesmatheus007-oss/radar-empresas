import { getPool } from "./database.js";
import { normalizeBrandName } from "../utils/textNormalization.js";
import type { ExcludedBrandRecord } from "../types/domain.js";

interface Row {
  id: number;
  name: string;
  normalized_name: string;
  created_at: string;
}

function toRecord(row: Row): ExcludedBrandRecord {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    createdAt: row.created_at,
  };
}

export async function listExcludedBrands(): Promise<ExcludedBrandRecord[]> {
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM excluded_brands ORDER BY name ASC");
  return (rows as Row[]).map(toRecord);
}

export async function getExcludedBrandNamesNormalized(): Promise<Set<string>> {
  const pool = getPool();
  const { rows } = await pool.query<{ normalized_name: string }>("SELECT normalized_name FROM excluded_brands");
  return new Set(rows.map((r) => r.normalized_name));
}

export async function addExcludedBrand(name: string): Promise<ExcludedBrandRecord | null> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Nome da marca não pode ser vazio.");
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO excluded_brands (name, normalized_name, created_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (normalized_name) DO NOTHING
     RETURNING *`,
    [trimmed, normalizeBrandName(trimmed), new Date().toISOString()]
  );
  if (rows.length === 0) return null; // já existe
  return toRecord(rows[0] as Row);
}

export async function removeExcludedBrand(id: number): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query("DELETE FROM excluded_brands WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

/** Verifica se um nome de empresa contém alguma marca excluída. */
export function matchesExcludedBrand(companyNameOrUrl: string, excludedNormalized: Set<string>): boolean {
  const normalizedTarget = normalizeBrandName(companyNameOrUrl);
  for (const brand of excludedNormalized) {
    if (!brand) continue;
    if (normalizedTarget.includes(brand)) return true;
  }
  return false;
}
