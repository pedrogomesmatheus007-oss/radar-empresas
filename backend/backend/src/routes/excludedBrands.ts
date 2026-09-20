import { Router } from "express";
import { excludedBrandSchema, validateBody } from "../middleware/validation.js";
import {
  listExcludedBrands,
  addExcludedBrand,
  removeExcludedBrand,
} from "../db/excludedBrandsRepository.js";

export const excludedBrandsRouter = Router();

excludedBrandsRouter.get("/", async (_req, res, next) => {
  try {
    res.json({ results: await listExcludedBrands() });
  } catch (err) {
    next(err);
  }
});

excludedBrandsRouter.post("/", validateBody(excludedBrandSchema), async (req, res, next) => {
  try {
    const { name } = req.body as { name: string };
    const created = await addExcludedBrand(name);
    if (!created) {
      res.status(409).json({ error: "Essa marca já está na lista de exclusão." });
      return;
    }
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

excludedBrandsRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "ID inválido." });
      return;
    }
    const removed = await removeExcludedBrand(id);
    if (!removed) {
      res.status(404).json({ error: "Marca não encontrada." });
      return;
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
