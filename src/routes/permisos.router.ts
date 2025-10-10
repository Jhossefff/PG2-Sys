// src/routes/permisos.router.ts
import { Router } from "express";
import { prisma } from "../db/prisma";

export const permisosRouter = Router();

/* helpers */
const has = (b: any, k: string) => Object.prototype.hasOwnProperty.call(b, k);

/* =========================
   GET /api/permisos
========================= */
permisosRouter.get("/", async (_req, res) => {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT idpermiso, nombre, descripcion
    FROM dbo.permisos
    ORDER BY idpermiso`;
  res.json(rows);
});

/* =========================
   GET /api/permisos/:id
========================= */
permisosRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const rows = await prisma.$queryRaw<any[]>`
    SELECT idpermiso, nombre, descripcion
    FROM dbo.permisos
    WHERE idpermiso = ${id}`;
  if (!rows.length) return res.status(404).json({ error: "no encontrado" });
  res.json(rows[0]);
});

/* =========================
   POST /api/permisos
========================= */
permisosRouter.post("/", async (req, res) => {
  const b = req.body as { nombre?: string; descripcion?: string | null };
  if (!b?.nombre) return res.status(400).json({ error: "nombre requerido" });

  const out = await prisma.$queryRaw<any[]>`
    INSERT INTO dbo.permisos (nombre, descripcion)
    OUTPUT INSERTED.idpermiso
    VALUES (${b.nombre}, ${b.descripcion ?? null})`;

  const row = await prisma.$queryRaw<any[]>`
    SELECT idpermiso, nombre, descripcion
    FROM dbo.permisos
    WHERE idpermiso = ${out[0].idpermiso}`;
  res.status(201).json(row[0]);
});

/* =========================
   PUT /api/permisos/:id
   (actualización parcial segura)
========================= */
permisosRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const b = req.body as { nombre?: string; descripcion?: string | null };
  if (!has(b, "nombre") && !has(b, "descripcion")) {
    return res.status(400).json({ error: "nada para actualizar" });
  }

  // UPDATE con banderas: solo cambia lo que venga en el body
  const sql = `
    UPDATE dbo.permisos
    SET
      nombre      = CASE WHEN @p2 = 1 THEN @p3 ELSE nombre END,
      descripcion = CASE WHEN @p4 = 1 THEN @p5 ELSE descripcion END
    WHERE idpermiso = @p1;
  `;

  const n = await prisma.$executeRawUnsafe(
    sql,
    // @p1
    id,
    // nombre: flag + valor
    has(b, "nombre") ? 1 : 0, has(b, "nombre") ? b.nombre! : null,
    // descripcion: flag + valor (permite null)
    has(b, "descripcion") ? 1 : 0, has(b, "descripcion") ? (b.descripcion ?? null) : null
  );

  if (n === 0) return res.status(404).json({ error: "no encontrado" });

  const row = await prisma.$queryRaw<any[]>`
    SELECT idpermiso, nombre, descripcion
    FROM dbo.permisos
    WHERE idpermiso = ${id}`;
  res.json(row[0]);
});

/* =========================
   DELETE /api/permisos/:id
========================= */
permisosRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  try {
    const n = await prisma.$executeRaw`
      DELETE FROM dbo.permisos WHERE idpermiso=${id}`;
    if (n === 0) return res.status(404).json({ error: "no encontrado" });
    res.status(204).send();
  } catch {
    res
      .status(409)
      .json({ error: "No se puede eliminar: está asignado en roles_permisos." });
  }
});
