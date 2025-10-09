import { Router } from "express";
import { prisma } from "../db/prisma";
export const estadosLugaresRouter = Router();

/** GET /api/estados-lugares */
estadosLugaresRouter.get("/", async (_req, res) => {
  try {
    const rows = await prisma.$queryRaw<{ idestado:number; estado:string }[]>`
      SELECT idestado, estado FROM dbo.estados_lugares ORDER BY idestado`;
    res.json(rows);
  } catch (e:any) { res.status(500).json({ error: e.message }); }
});

/** GET /api/estados-lugares/:id */
estadosLugaresRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error:"id inválido" });
  try {
    const rows = await prisma.$queryRaw<{ idestado:number; estado:string }[]>`
      SELECT idestado, estado FROM dbo.estados_lugares WHERE idestado = ${id}`;
    if (rows.length === 0) return res.status(404).json({ error:"no encontrado" });
    res.json(rows[0]);
  } catch (e:any) { res.status(500).json({ error: e.message }); }
});

/** POST /api/estados-lugares  body:{estado} */
estadosLugaresRouter.post("/", async (req, res) => {
  const { estado } = req.body as { estado?: string };
  if (!estado) return res.status(400).json({ error: "estado requerido" });
  try {
    const out = await prisma.$queryRaw<{ idestado:number }[]>`
      INSERT INTO dbo.estados_lugares(estado)
      OUTPUT INSERTED.idestado VALUES (${estado})`;
    const id = out[0].idestado;
    const row = await prisma.$queryRaw<{ idestado:number; estado:string }[]>`
      SELECT idestado, estado FROM dbo.estados_lugares WHERE idestado = ${id}`;
    res.status(201).json(row[0]);
  } catch (e:any) { res.status(500).json({ error: e.message }); }
});

/** PUT /api/estados-lugares/:id  body:{estado} */
estadosLugaresRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { estado } = req.body as { estado?: string };
  if (!Number.isInteger(id)) return res.status(400).json({ error:"id inválido" });
  if (!estado) return res.status(400).json({ error: "estado requerido" });
  try {
    const n = await prisma.$executeRaw`
      UPDATE dbo.estados_lugares SET estado=${estado} WHERE idestado=${id}`;
    if (n === 0) return res.status(404).json({ error:"no encontrado" });
    const row = await prisma.$queryRaw<{ idestado:number; estado:string }[]>`
      SELECT idestado, estado FROM dbo.estados_lugares WHERE idestado = ${id}`;
    res.json(row[0]);
  } catch (e:any) { res.status(500).json({ error: e.message }); }
});

/** DELETE /api/estados-lugares/:id */
estadosLugaresRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error:"id inválido" });
  try {
    const n = await prisma.$executeRaw`
      DELETE FROM dbo.estados_lugares WHERE idestado=${id}`;
    if (n === 0) return res.status(404).json({ error:"no encontrado" });
    res.status(204).send();
  } catch (e:any) {
    // en uso por FK (lugares_estacionamiento)
    return res.status(409).json({ error: "No se puede eliminar: está en uso." });
  }
});
