import { Router } from "express";
import { prisma } from "../db/prisma";
export const rolesRouter = Router();

rolesRouter.get("/", async (_req, res) => {
  const rows = await prisma.$queryRaw<{ idrol:number; nombre:string; descripcion:string|null }[]>`
    SELECT idrol, nombre, descripcion FROM dbo.roles ORDER BY idrol`;
  res.json(rows);
});

rolesRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error:"id inválido" });
  const rows = await prisma.$queryRaw<any[]>`
    SELECT idrol, nombre, descripcion FROM dbo.roles WHERE idrol=${id}`;
  if (rows.length === 0) return res.status(404).json({ error:"no encontrado" });
  res.json(rows[0]);
});

rolesRouter.post("/", async (req, res) => {
  const { nombre, descripcion } = req.body as { nombre?: string; descripcion?: string };
  if (!nombre) return res.status(400).json({ error:"nombre requerido" });
  const out = await prisma.$queryRaw<{ idrol:number }[]>`
    INSERT INTO dbo.roles(nombre, descripcion) OUTPUT INSERTED.idrol
    VALUES (${nombre}, ${descripcion ?? null})`;
  const row = await prisma.$queryRaw<any[]>`
    SELECT idrol, nombre, descripcion FROM dbo.roles WHERE idrol=${out[0].idrol}`;
  res.status(201).json(row[0]);
});

rolesRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, descripcion } = req.body as { nombre?: string; descripcion?: string };
  if (!Number.isInteger(id)) return res.status(400).json({ error:"id inválido" });
  const n = await prisma.$executeRaw`
    UPDATE dbo.roles SET
      nombre=${nombre ?? prisma.$queryRaw`nombre`},
      descripcion=${typeof descripcion === "undefined" ? prisma.$queryRaw`descripcion` : descripcion}
    WHERE idrol=${id}`;
  if (n === 0) return res.status(404).json({ error:"no encontrado" });
  const row = await prisma.$queryRaw<any[]>`
    SELECT idrol, nombre, descripcion FROM dbo.roles WHERE idrol=${id}`;
  res.json(row[0]);
});

rolesRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error:"id inválido" });
  try {
    const n = await prisma.$executeRaw`
      DELETE FROM dbo.roles WHERE idrol=${id}`;
    if (n === 0) return res.status(404).json({ error:"no encontrado" });
    res.status(204).send();
  } catch {
    res.status(409).json({ error: "No se puede eliminar: hay usuarios o permisos asociados." });
  }
});
