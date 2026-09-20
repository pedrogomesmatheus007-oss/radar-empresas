-- Radar de Empresas — schema PostgreSQL (Neon / Render Postgres)
-- Datas são guardadas como TEXT em formato ISO-8601 (UTC), definidas pela
-- própria aplicação no momento da inserção (não por DEFAULT do banco), para
-- manter o mesmo formato em toda a aplicação, independente do provedor.

CREATE TABLE IF NOT EXISTS domains (
  id                 SERIAL PRIMARY KEY,
  domain             TEXT NOT NULL,           -- domínio como veio da fonte (ex: www.empresa.com.br)
  normalized_domain  TEXT NOT NULL,           -- identificador único normalizado (ex: empresa.com.br)
  url                TEXT NOT NULL,           -- URL completa validada (https://...)
  company_name       TEXT NOT NULL,
  niche              TEXT NOT NULL,
  compliance_status  TEXT NOT NULL,           -- PASS_REVIEW | MANUAL_REVIEW | REJECT
  source_note        TEXT,                    -- de onde veio a informação (para transparência)
  -- Emparelhamento opcional com um CNPJ da mesma empresa (pedido do usuário:
  -- "cada URL um CNPJ também"). Fica tudo NULL quando não foi possível
  -- encontrar/validar um CNPJ real para essa empresa — nunca é inventado.
  cnpj               TEXT,                    -- 14 dígitos, só quando validado (ATIVA, não-MEI, não pessoa física)
  cnpj_formatted     TEXT,
  cnpj_status        TEXT,
  cnpj_legal_nature  TEXT,
  cnpj_verified      BOOLEAN NOT NULL DEFAULT FALSE,
  first_seen_at      TEXT NOT NULL,
  UNIQUE(normalized_domain)
);

CREATE INDEX IF NOT EXISTS idx_domains_niche ON domains(niche);

CREATE TABLE IF NOT EXISTS cnpjs (
  id             SERIAL PRIMARY KEY,
  cnpj           TEXT NOT NULL,               -- somente dígitos (14 caracteres)
  cnpj_formatted TEXT NOT NULL,               -- 00.000.000/0000-00
  company_name   TEXT NOT NULL,
  status         TEXT NOT NULL,               -- descrição da situação cadastral (ex: ATIVA)
  is_mei         BOOLEAN NOT NULL DEFAULT FALSE,
  legal_nature   TEXT,
  niche          TEXT NOT NULL,
  source_note    TEXT,
  first_seen_at  TEXT NOT NULL,
  UNIQUE(cnpj)
);

CREATE INDEX IF NOT EXISTS idx_cnpjs_niche ON cnpjs(niche);

CREATE TABLE IF NOT EXISTS searches (
  id                  SERIAL PRIMARY KEY,
  type                TEXT NOT NULL,          -- 'urls' | 'cnpj'
  query               TEXT NOT NULL,          -- nicho pesquisado
  requested_quantity  INTEGER NOT NULL,
  result_quantity     INTEGER NOT NULL,
  created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_searches_created_at ON searches(created_at);

CREATE TABLE IF NOT EXISTS excluded_brands (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  UNIQUE(normalized_name)
);
