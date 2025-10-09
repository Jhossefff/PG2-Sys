import { Router } from "express";
import { prisma } from "../db/prisma";

export const tarifasRouter = Router();

/** GET /api/tarifas?empresaId= */
tarifasRouter.get("/", async (req, res) => {
  const empresaId =
    typeof req.query.empresaId === "string" ? Number(req.query.empresaId) : null;

  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT t.idtarifa, t.idempresa, t.tipo_vehiculo, t.tarifa_por_hora, t.tarifa_por_dia,
              t.fecha_inicio, t.fecha_fin, e.nombre AS empresa_nombre
       FROM dbo.tarifas t
       JOIN dbo.empresas e ON e.idempresa = t.idempresa
       WHERE (@p1 IS NULL OR t.idempresa = @p1)
       ORDER BY t.idtarifa DESC`,
      empresaId
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/tarifas/:id */
tarifasRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const rows = await prisma.$queryRaw<any[]>`
    SELECT t.idtarifa, t.idempresa, t.tipo_vehiculo, t.tarifa_por_hora, t.tarifa_por_dia,
           t.fecha_inicio, t.fecha_fin
    FROM dbo.tarifas t
    WHERE t.idtarifa = ${id}`;
  if (!rows.length) return res.status(404).json({ error: "no encontrado" });
  res.json(rows[0]);
});

/** POST /api/tarifas */
tarifasRouter.post("/", async (req, res) => {
  const b = req.body as {
    idempresa?: number;
    tipo_vehiculo?: string;
    tarifa_por_hora?: number;
    tarifa_por_dia?: number | null;
    fecha_inicio?: string | Date | null;
    fecha_fin?: string | Date | null;
  };

  if (!b?.idempresa || !b?.tipo_vehiculo || b.tarifa_por_hora == null) {
    return res
      .status(400)
      .json({ error: "idempresa, tipo_vehiculo y tarifa_por_hora son requeridos" });
  }

  const idempresa = Number(b.idempresa);
  const tarifa_por_hora = Number(b.tarifa_por_hora);
  const tarifa_por_dia = b.tarifa_por_dia == null ? null : Number(b.tarifa_por_dia);
  const fecha_inicio = b.fecha_inicio ?? null;
  const fecha_fin = b.fecha_fin ?? null;

  try {
    const out = await prisma.$queryRawUnsafe<{ idtarifa: number }[]>(
      `INSERT INTO dbo.tarifas
         (idempresa, tipo_vehiculo, tarifa_por_hora, tarifa_por_dia, fecha_inicio, fecha_fin)
       OUTPUT INSERTED.idtarifa
       VALUES (@p1, @p2, @p3, @p4, @p5, @p6)`,
      idempresa,
      b.tipo_vehiculo,
      tarifa_por_hora,
      tarifa_por_dia,
      fecha_inicio,
      fecha_fin
    );

    const row = await prisma.$queryRaw<any[]>`
      SELECT t.idtarifa, t.idempresa, t.tipo_vehiculo, t.tarifa_por_hora, t.tarifa_por_dia,
             t.fecha_inicio, t.fecha_fin
      FROM dbo.tarifas t
      WHERE t.idtarifa = ${out[0].idtarifa}`;
    res.status(201).json(row[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** PUT /api/tarifas/:id */
tarifasRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const {
    idempresa,
    tipo_vehiculo,
    tarifa_por_hora,
    tarifa_por_dia,
    fecha_inicio,
    fecha_fin,
  } = req.body as {
    idempresa?: number;
    tipo_vehiculo?: string;
    tarifa_por_hora?: number;
    tarifa_por_dia?: number | null;
    fecha_inicio?: string | Date | null;
    fecha_fin?: string | Date | null;
  };

  try {
    const n = await prisma.$executeRaw`
      UPDATE dbo.tarifas SET
        idempresa=${typeof idempresa === "undefined" ? prisma.$queryRaw`idempresa` : Number(idempresa)},
        tipo_vehiculo=${typeof tipo_vehiculo === "undefined" ? prisma.$queryRaw`tipo_vehiculo` : tipo_vehiculo},
        tarifa_por_hora=${typeof tarifa_por_hora === "undefined" ? prisma.$queryRaw`tarifa_por_hora` : Number(tarifa_por_hora)},
        tarifa_por_dia=${
          typeof tarifa_por_dia === "undefined"
            ? prisma.$queryRaw`tarifa_por_dia`
            : tarifa_por_dia == null
              ? null
              : Number(tarifa_por_dia)
        },
        fecha_inicio=${
          typeof fecha_inicio === "undefined" ? prisma.$queryRaw`fecha_inicio` : fecha_inicio
        },
        fecha_fin=${
          typeof fecha_fin === "undefined" ? prisma.$queryRaw`fecha_fin` : fecha_fin
        }
      WHERE idtarifa=${id}`;

    if (n === 0) return res.status(404).json({ error: "no encontrado" });

    const row = await prisma.$queryRaw<any[]>`
      SELECT t.idtarifa, t.idempresa, t.tipo_vehiculo, t.tarifa_por_hora, t.tarifa_por_dia,
             t.fecha_inicio, t.fecha_fin
      FROM dbo.tarifas t
      WHERE t.idtarifa = ${id}`;
    res.json(row[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** DELETE /api/tarifas/:id */
tarifasRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  try {
    const n = await prisma.$executeRaw`DELETE FROM dbo.tarifas WHERE idtarifa=${id}`;
    if (n === 0) return res.status(404).json({ error: "no encontrado" });
    res.status(204).send();
  } catch {
    res.status(409).json({ error: "No se puede eliminar: está en uso por reservaciones." });
  }
});
