import { Router } from "express";
import { prisma } from "../db/prisma";
export const estadosPagoRouter = Router();

estadosPagoRouter.get("/", async (_req, res) => {
  const rows = await prisma.$queryRaw<{ idestado_pago:number; descripcion:string }[]>`
    SELECT idestado_pago, descripcion FROM dbo.estados_pago ORDER BY idestado_pago`;
  res.json(rows);
});

estadosPagoRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error:"id inválido" });
  const rows = await prisma.$queryRaw<{ idestado_pago:number; descripcion:string }[]>`
    SELECT idestado_pago, descripcion FROM dbo.estados_pago WHERE idestado_pago=${id}`;
  if (rows.length === 0) return res.status(404).json({ error:"no encontrado" });
  res.json(rows[0]);
});

estadosPagoRouter.post("/", async (req, res) => {
  const { descripcion } = req.body as { descripcion?: string };
  if (!descripcion) return res.status(400).json({ error:"descripcion requerida" });
  const out = await prisma.$queryRaw<{ idestado_pago:number }[]>`
    INSERT INTO dbo.estados_pago(descripcion)
    OUTPUT INSERTED.idestado_pago VALUES (${descripcion})`;
  const row = await prisma.$queryRaw<{ idestado_pago:number; descripcion:string }[]>`
    SELECT idestado_pago, descripcion FROM dbo.estados_pago WHERE idestado_pago=${out[0].idestado_pago}`;
  res.status(201).json(row[0]);
});

estadosPagoRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { descripcion } = req.body as { descripcion?: string };
  if (!Number.isInteger(id)) return res.status(400).json({ error:"id inválido" });
  if (!descripcion) return res.status(400).json({ error:"descripcion requerida" });
  const n = await prisma.$executeRaw`
    UPDATE dbo.estados_pago SET descripcion=${descripcion} WHERE idestado_pago=${id}`;
  if (n === 0) return res.status(404).json({ error:"no encontrado" });
  const row = await prisma.$queryRaw<{ idestado_pago:number; descripcion:string }[]>`
    SELECT idestado_pago, descripcion FROM dbo.estados_pago WHERE idestado_pago=${id}`;
  res.json(row[0]);
});

estadosPagoRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error:"id inválido" });
  try {
    const n = await prisma.$executeRaw`
      DELETE FROM dbo.estados_pago WHERE idestado_pago=${id}`;
    if (n === 0) return res.status(404).json({ error:"no encontrado" });
    res.status(204).send();
  } catch {
    res.status(409).json({ error: "No se puede eliminar: está en uso (facturas)." });
  }
});
