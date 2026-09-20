import { Router } from "express";
import { listRecentSearches } from "../db/searchesRepository.js";
import { env } from "../config/env.js";

export const searchesRouter = Router();

searchesRouter.get("/", async (_req, res, next) => {
  try {
    const searches = await listRecentSearches();

    const groupedByDate = new Map<string, typeof searches>();
    for (const search of searches) {
      const dateKey = search.createdAt.slice(0, 10); // YYYY-MM-DD
      if (!groupedByDate.has(dateKey)) groupedByDate.set(dateKey, []);
      groupedByDate.get(dateKey)!.push(search);
    }

    const groups = [...groupedByDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({ date, items }));

    res.json({ groups, retentionDays: env.recentSearchesRetentionDays, total: searches.length });
  } catch (err) {
    next(err);
  }
});
