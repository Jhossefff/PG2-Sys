import { Router } from "express";
import { prisma } from "../db/prisma";
export const permisosRouter = Router();

permisosRouter.get("/", async (_req, res) => {
  const rows = await prisma.$queryRaw<{ idpermiso:number; nombre:string; descripcion:string|null }[]>`
    SELECT idpermiso, nombre, descripcion FROM dbo.permisos ORDER BY idpermiso`;
  res.json(rows);
});

permisosRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error:"id inválido" });
  const rows = await prisma.$queryRaw<any[]>`
    SELECT idpermiso, nombre, descripcion FROM dbo.permisos WHERE idpermiso=${id}`;
  if (rows.length === 0) return res.status(404).json({ error:"no encontrado" });
  res.json(rows[0]);
});

permisosRouter.post("/", async (req, res) => {
  const { nombre, descripcion } = req.body as { nombre?: string; descripcion?: string };
  if (!nombre) return res.status(400).json({ error:"nombre requerido" });
  const out = await prisma.$queryRaw<{ idpermiso:number }[]>`
    INSERT INTO dbo.permisos(nombre, descripcion) OUTPUT INSERTED.idpermiso
    VALUES (${nombre}, ${descripcion ?? null})`;
  const row = await prisma.$queryRaw<any[]>`
    SELECT idpermiso, nombre, descripcion FROM dbo.permisos WHERE idpermiso=${out[0].idpermiso}`;
  res.status(201).json(row[0]);
});

permisosRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, descripcion } = req.body as { nombre?: string; descripcion?: string };
  if (!Number.isInteger(id)) return res.status(400).json({ error:"id inválido" });
  if (!nombre && typeof descripcion === "undefined")
    return res.status(400).json({ error:"nada para actualizar" });
  const n = await prisma.$executeRaw`
    UPDATE dbo.permisos SET
      nombre=${nombre ?? prisma.$queryRaw`nombre`},
      descripcion=${typeof descripcion === "undefined" ? prisma.$queryRaw`descripcion` : descripcion}
    WHERE idpermiso=${id}`;
  if (n === 0) return res.status(404).json({ error:"no encontrado" });
  const row = await prisma.$queryRaw<any[]>`
    SELECT idpermiso, nombre, descripcion FROM dbo.permisos WHERE idpermiso=${id}`;
  res.json(row[0]);
});

permisosRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error:"id inválido" });
  try {
    const n = await prisma.$executeRaw`
      DELETE FROM dbo.permisos WHERE idpermiso=${id}`;
    if (n === 0) return res.status(404).json({ error:"no encontrado" });
    res.status(204).send();
  } catch {
    res.status(409).json({ error: "No se puede eliminar: está asignado en roles_permisos." });
  }
});
