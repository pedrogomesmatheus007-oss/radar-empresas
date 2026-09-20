import { getPool } from "./database.js";
import type { CnpjRecord } from "../types/domain.js";

interface Row {
  id: number;
  cnpj: string;
  cnpj_formatted: string;
  company_name: string;
  status: string;
  is_mei: boolean;
  legal_nature: string | null;
  niche: string;
  source_note: string | null;
  first_seen_at: string;
}

function toRecord(row: Row): CnpjRecord {
  return {
    id: row.id,
    cnpj: row.cnpj,
    cnpjFormatted: row.cnpj_formatted,
    companyName: row.company_name,
    status: row.status,
    isMei: Boolean(row.is_mei),
    legalNature: row.legal_nature,
    niche: row.niche,
    sourceNote: row.source_note,
    firstSeenAt: row.first_seen_at,
  };
}

export async function isCnpjAlreadyUsed(cnpj: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query("SELECT 1 FROM cnpjs WHERE cnpj = $1 LIMIT 1", [cnpj]);
  return rows.length > 0;
}

export async function getUsedCnpjs(): Promise<Set<string>> {
  const pool = getPool();
  const { rows } = await pool.query<{ cnpj: string }>("SELECT cnpj FROM cnpjs");
  return new Set(rows.map((r) => r.cnpj));
}

export interface InsertCnpjInput {
  cnpj: string;
  cnpjFormatted: string;
  companyName: string;
  status: string;
  isMei: boolean;
  legalNature?: string | null;
  niche: string;
  sourceNote?: string | null;
}

export async function insertCnpjIfNew(input: InsertCnpjInput): Promise<CnpjRecord | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO cnpjs (cnpj, cnpj_formatted, company_name, status, is_mei, legal_nature, niche, source_note, first_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (cnpj) DO NOTHING
     RETURNING *`,
    [
      input.cnpj,
      input.cnpjFormatted,
      input.companyName,
      input.status,
      input.isMei,
      input.legalNature ?? null,
      input.niche,
      input.sourceNote ?? null,
      new Date().toISOString(),
    ]
  );
  if (rows.length === 0) return null;
  return toRecord(rows[0] as Row);
}

export async function countCnpjs(): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM cnpjs");
  return Number(rows[0]?.count ?? 0);
}

export async function listAllCnpjs(): Promise<CnpjRecord[]> {
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM cnpjs ORDER BY first_seen_at DESC");
  return (rows as Row[]).map(toRecord);
}

export async function listCnpjsByNiche(niche: string): Promise<CnpjRecord[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM cnpjs WHERE niche = $1 ORDER BY first_seen_at DESC",
    [niche]
  );
  return (rows as Row[]).map(toRecord);
}
