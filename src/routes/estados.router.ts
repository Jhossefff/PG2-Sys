import { Router } from "express";
import { prisma } from "../db/prisma";

export const estadosRouter = Router();

/** GET /api/estados */
estadosRouter.get("/", async (_req, res) => {
  try {
    const rows = await prisma.$queryRaw<{ idestado: number; estado: string }[]>`
      SELECT idestado, estado FROM dbo.estados_lugares ORDER BY idestado`;
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/estados/:id */
estadosRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });
  try {
    const rows = await prisma.$queryRaw<{ idestado: number; estado: string }[]>`
      SELECT idestado, estado FROM dbo.estados_lugares WHERE idestado = ${id}`;
    if (rows.length === 0) return res.status(404).json({ error: "no encontrado" });
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/estados  body: { estado } */
estadosRouter.post("/", async (req, res) => {
  const { estado } = req.body as { estado?: string };
  if (!estado) return res.status(400).json({ error: "estado requerido" });

  try {
    const created = await prisma.$executeRaw`
      INSERT INTO dbo.estados_lugares(estado) VALUES (${estado})`;
    // Devuelve el último insertado
    const last = await prisma.$queryRaw<{ idestado: number; estado: string }[]>`
      SELECT TOP(1) idestado, estado FROM dbo.estados_lugares ORDER BY idestado DESC`;
    res.status(201).json(last[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** PUT /api/estados/:id  body: { estado } */
estadosRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { estado } = req.body as { estado?: string };
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });
  if (!estado) return res.status(400).json({ error: "estado requerido" });

  try {
    const updated = await prisma.$executeRaw`
      UPDATE dbo.estados_lugares SET estado = ${estado} WHERE idestado = ${id}`;
    if (updated === 0) return res.status(404).json({ error: "no encontrado" });

    const row = await prisma.$queryRaw<{ idestado: number; estado: string }[]>`
      SELECT idestado, estado FROM dbo.estados_lugares WHERE idestado = ${id}`;
    res.json(row[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** DELETE /api/estados/:id */
estadosRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  try {
    const deleted = await prisma.$executeRaw`
      DELETE FROM dbo.estados_lugares WHERE idestado = ${id}`;
    if (deleted === 0) return res.status(404).json({ error: "no encontrado" });
    res.status(204).send();
  } catch (e: any) {
    // Violación de FK devuelve error de SQL -> 409
    if (String(e.message || "").includes("conflicted")) {
      return res.status(409).json({ error: "No se puede eliminar: está en uso." });
    }
    res.status(500).json({ error: e.message });
  }
});
