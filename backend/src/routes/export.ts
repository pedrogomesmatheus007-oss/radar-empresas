import { Router } from "express";
import { listAllDomains } from "../db/domainsRepository.js";
import { listAllCnpjs } from "../db/cnpjsRepository.js";

export const exportRouter = Router();

function toCsvValue(value: string | number | boolean | null): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(values: (string | number | boolean | null)[]): string {
  return values.map(toCsvValue).join(",");
}

exportRouter.get("/urls.csv", async (_req, res, next) => {
  try {
    const domains = await listAllDomains();
    const header = toCsvRow(["Empresa", "URL", "Domínio", "Nicho", "CNPJ", "CNPJ sem pontuação", "Status", "Data"]);
    const rows = domains.map((d) =>
      toCsvRow([
        d.companyName,
        d.url,
        d.normalizedDomain,
        d.niche,
        d.cnpjVerified ? d.cnpjFormatted : "Não foi possível verificar este dado.",
        d.cnpjVerified ? d.cnpj : "",
        d.complianceStatus === "PASS_REVIEW" ? "APTO PARA REVISÃO" : "REVISÃO NECESSÁRIA",
        d.firstSeenAt,
      ])
    );
    const csv = [header, ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="urls.csv"');
    res.send(`﻿${csv}`); // BOM para acentuação correta no Excel
  } catch (err) {
    next(err);
  }
});

exportRouter.get("/cnpj.csv", async (_req, res, next) => {
  try {
    const cnpjs = await listAllCnpjs();
    const header = toCsvRow([
      "Empresa",
      "CNPJ",
      "CNPJ sem pontuação",
      "Situação",
      "MEI",
      "Natureza jurídica",
      "Data",
    ]);
    const rows = cnpjs.map((c) =>
      toCsvRow([
        c.companyName,
        c.cnpjFormatted,
        c.cnpj,
        c.status,
        c.isMei ? "SIM" : "NÃO",
        c.legalNature ?? "Não foi possível verificar este dado.",
        c.firstSeenAt,
      ])
    );
    const csv = [header, ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="cnpj.csv"');
    res.send(`﻿${csv}`);
  } catch (err) {
    next(err);
  }
});
