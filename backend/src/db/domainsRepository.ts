import { getPool } from "./database.js";
import type { DomainRecord } from "../types/domain.js";

interface Row {
  id: number;
  domain: string;
  normalized_domain: string;
  url: string;
  company_name: string;
  niche: string;
  compliance_status: string;
  source_note: string | null;
  cnpj: string | null;
  cnpj_formatted: string | null;
  cnpj_status: string | null;
  cnpj_legal_nature: string | null;
  cnpj_verified: boolean;
  first_seen_at: string;
}

function toRecord(row: Row): DomainRecord {
  return {
    id: row.id,
    domain: row.domain,
    normalizedDomain: row.normalized_domain,
    url: row.url,
    companyName: row.company_name,
    niche: row.niche,
    complianceStatus: row.compliance_status as DomainRecord["complianceStatus"],
    sourceNote: row.source_note,
    cnpj: row.cnpj,
    cnpjFormatted: row.cnpj_formatted,
    cnpjStatus: row.cnpj_status,
    cnpjLegalNature: row.cnpj_legal_nature,
    cnpjVerified: Boolean(row.cnpj_verified),
    firstSeenAt: row.first_seen_at,
  };
}

export async function isDomainAlreadyUsed(normalizedDomain: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query("SELECT 1 FROM domains WHERE normalized_domain = $1 LIMIT 1", [
    normalizedDomain,
  ]);
  return rows.length > 0;
}

export async function getUsedNormalizedDomains(): Promise<Set<string>> {
  const pool = getPool();
  const { rows } = await pool.query<{ normalized_domain: string }>("SELECT normalized_domain FROM domains");
  return new Set(rows.map((r) => r.normalized_domain));
}

/** CNPJs já emparelhados com alguma URL — usado para nunca repetir um CNPJ,
 * mesmo quando ele aparece emparelhado a uma URL em vez de vir da aba CNPJ. */
export async function getUsedCnpjsFromDomains(): Promise<Set<string>> {
  const pool = getPool();
  const { rows } = await pool.query<{ cnpj: string }>("SELECT cnpj FROM domains WHERE cnpj IS NOT NULL");
  return new Set(rows.map((r) => r.cnpj));
}

export interface InsertDomainInput {
  domain: string;
  normalizedDomain: string;
  url: string;
  companyName: string;
  niche: string;
  complianceStatus: DomainRecord["complianceStatus"];
  sourceNote?: string | null;
  cnpj?: string | null;
  cnpjFormatted?: string | null;
  cnpjStatus?: string | null;
  cnpjLegalNature?: string | null;
  cnpjVerified?: boolean;
}

/**
 * Insere um domínio novo. Retorna null se já existir (a constraint
 * UNIQUE(normalized_domain) no banco garante isso de forma atômica via
 * ON CONFLICT DO NOTHING, além da checagem prévia em memória do chamador).
 */
export async function insertDomainIfNew(input: InsertDomainInput): Promise<DomainRecord | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO domains (
       domain, normalized_domain, url, company_name, niche, compliance_status, source_note,
       cnpj, cnpj_formatted, cnpj_status, cnpj_legal_nature, cnpj_verified, first_seen_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (normalized_domain) DO NOTHING
     RETURNING *`,
    [
      input.domain,
      input.normalizedDomain,
      input.url,
      input.companyName,
      input.niche,
      input.complianceStatus,
      input.sourceNote ?? null,
      input.cnpj ?? null,
      input.cnpjFormatted ?? null,
      input.cnpjStatus ?? null,
      input.cnpjLegalNature ?? null,
      input.cnpjVerified ?? false,
      new Date().toISOString(),
    ]
  );
  if (rows.length === 0) return null;
  return toRecord(rows[0] as Row);
}

export async function countDomains(): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM domains");
  return Number(rows[0]?.count ?? 0);
}

export async function listDomainsByNiche(niche: string): Promise<DomainRecord[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM domains WHERE niche = $1 ORDER BY first_seen_at DESC",
    [niche]
  );
  return (rows as Row[]).map(toRecord);
}

export async function listAllDomains(): Promise<DomainRecord[]> {
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM domains ORDER BY first_seen_at DESC");
  return (rows as Row[]).map(toRecord);
}
