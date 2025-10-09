import { Router } from "express";
import { prisma } from "../db/prisma";
export const formasPagoRouter = Router();

formasPagoRouter.get("/", async (_req, res) => {
  try {
    const rows = await prisma.$queryRaw<{ idforma_pago:number; descripcion:string }[]>`
      SELECT idforma_pago, descripcion FROM dbo.formas_pago ORDER BY idforma_pago`;
    res.json(rows);
  } catch (e:any) { res.status(500).json({ error: e.message }); }
});

formasPagoRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error:"id inválido" });
  const rows = await prisma.$queryRaw<{ idforma_pago:number; descripcion:string }[]>`
    SELECT idforma_pago, descripcion FROM dbo.formas_pago WHERE idforma_pago=${id}`;
  if (rows.length === 0) return res.status(404).json({ error:"no encontrado" });
  res.json(rows[0]);
});

formasPagoRouter.post("/", async (req, res) => {
  const { descripcion } = req.body as { descripcion?: string };
  if (!descripcion) return res.status(400).json({ error:"descripcion requerida" });
  const out = await prisma.$queryRaw<{ idforma_pago:number }[]>`
    INSERT INTO dbo.formas_pago(descripcion)
    OUTPUT INSERTED.idforma_pago VALUES (${descripcion})`;
  const row = await prisma.$queryRaw<{ idforma_pago:number; descripcion:string }[]>`
    SELECT idforma_pago, descripcion FROM dbo.formas_pago WHERE idforma_pago=${out[0].idforma_pago}`;
  res.status(201).json(row[0]);
});

formasPagoRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { descripcion } = req.body as { descripcion?: string };
  if (!Number.isInteger(id)) return res.status(400).json({ error:"id inválido" });
  if (!descripcion) return res.status(400).json({ error:"descripcion requerida" });
  const n = await prisma.$executeRaw`
    UPDATE dbo.formas_pago SET descripcion=${descripcion} WHERE idforma_pago=${id}`;
  if (n === 0) return res.status(404).json({ error:"no encontrado" });
  const row = await prisma.$queryRaw<{ idforma_pago:number; descripcion:string }[]>`
    SELECT idforma_pago, descripcion FROM dbo.formas_pago WHERE idforma_pago=${id}`;
  res.json(row[0]);
});

formasPagoRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error:"id inválido" });
  try {
    const n = await prisma.$executeRaw`
      DELETE FROM dbo.formas_pago WHERE idforma_pago=${id}`;
    if (n === 0) return res.status(404).json({ error:"no encontrado" });
    res.status(204).send();
  } catch (e:any) {
    return res.status(409).json({ error: "No se puede eliminar: está en uso (facturas/ingresos)." });
  }
});
