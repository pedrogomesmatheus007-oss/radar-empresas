import { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";
import { normalizeBrandName } from "../utils/textNormalization.js";

const logger = createLogger("database");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_EXCLUDED_BRANDS = [
  "Nike",
  "Adidas",
  "Puma",
  "Apple",
  "Samsung",
  "Microsoft",
  "Google",
  "Amazon",
  "Mercado Livre",
  "Shopee",
  "Alibaba",
  "AliExpress",
  "Magazine Luiza",
  "Americanas",
  "Casas Bahia",
  "Netshoes",
];

let pool: Pool | null = null;

/**
 * Retorna o pool de conexões Postgres (Neon, Render Postgres ou qualquer
 * outro provedor compatível). Requer a variável DATABASE_URL no .env.
 * A maioria dos provedores gratuitos (Neon, Render) exige TLS mas usa
 * certificado autoassinado — por isso `rejectUnauthorized: false`.
 */
export function getPool(): Pool {
  if (pool) return pool;

  if (!env.databaseUrl) {
    throw new Error(
      "DATABASE_URL não configurada. Defina no .env a string de conexão do seu banco Postgres (Neon, Render Postgres, etc.)."
    );
  }

  pool = new Pool({
    connectionString: env.databaseUrl,
    ssl: env.databaseUrl.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });

  return pool;
}

/**
 * Cria as tabelas (se ainda não existirem) e garante a lista padrão de
 * marcas excluídas. Deve ser chamada uma vez, no início do servidor, antes
 * de aceitar requisições.
 */
export async function initDb(): Promise<void> {
  const p = getPool();

  const schemaPath = path.resolve(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  await p.query(schema);

  await seedExcludedBrands(p);

  logger.info("Banco de dados (Postgres) inicializado");
}

async function seedExcludedBrands(p: Pool): Promise<void> {
  const { rows } = await p.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM excluded_brands");
  if (Number(rows[0]?.count ?? 0) > 0) return;

  for (const brand of DEFAULT_EXCLUDED_BRANDS) {
    await p.query(
      "INSERT INTO excluded_brands (name, normalized_name, created_at) VALUES ($1, $2, $3) ON CONFLICT (normalized_name) DO NOTHING",
      [brand, normalizeBrandName(brand), new Date().toISOString()]
    );
  }
  logger.info("Lista padrão de marcas excluídas criada", { total: DEFAULT_EXCLUDED_BRANDS.length });
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
