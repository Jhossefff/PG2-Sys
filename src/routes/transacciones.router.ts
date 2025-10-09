// src/routes/transacciones.router.ts
import { Router } from "express";
import { prisma } from "../db/prisma";

export const transaccionesRouter = Router();

/* Helpers */
const has = (o: any, k: string) =>
  Object.prototype.hasOwnProperty.call(o, k);

/* ======================================================
   GET /api/transacciones
   Filtros opcionales: ?idfactura=&idreservacion=&tipo=&desde=&hasta=
====================================================== */
transaccionesRouter.get("/", async (req, res) => {
  const idfactura =
    typeof req.query.idfactura === "string" ? Number(req.query.idfactura) : null;
  const idreservacion =
    typeof req.query.idreservacion === "string" ? Number(req.query.idreservacion) : null;
  const tipo =
    typeof req.query.tipo === "string" ? req.query.tipo : null;
  const desde = typeof req.query.desde === "string" ? req.query.desde : null;
  const hasta = typeof req.query.hasta === "string" ? req.query.hasta : null;

  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT t.idtransaccion, t.idfactura, t.idreservacion,
              t.tipo_transaccion, t.descripcion, t.fecha_transaccion
       FROM dbo.transacciones t
       WHERE (@p1 IS NULL OR t.idfactura = @p1)
         AND (@p2 IS NULL OR t.idreservacion = @p2)
         AND (@p3 IS NULL OR t.tipo_transaccion = @p3)
         AND (@p4 IS NULL OR t.fecha_transaccion >= TRY_CONVERT(datetime2, CAST(@p4 AS nvarchar(50)), 127))
         AND (@p5 IS NULL OR t.fecha_transaccion <= TRY_CONVERT(datetime2, CAST(@p5 AS nvarchar(50)), 127))
       ORDER BY t.idtransaccion DESC`,
      idfactura, idreservacion, tipo, desde, hasta
    );
    res.json(rows);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

/* ======================================================
   GET /api/transacciones/:id
====================================================== */
transaccionesRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT t.idtransaccion, t.idfactura, t.idreservacion,
             t.tipo_transaccion, t.descripcion, t.fecha_transaccion
      FROM dbo.transacciones t
      WHERE t.idtransaccion = ${id}`;
    if (!rows.length) return res.status(404).json({ error: "no encontrado" });
    res.json(rows[0]);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

/* ======================================================
   POST /api/transacciones
   Requiere al menos uno: idfactura o idreservacion.
   Requiere: tipo_transaccion.
   Opcionales: descripcion, fecha_transaccion (ISO).
====================================================== */
transaccionesRouter.post("/", async (req, res) => {
  const b = req.body as {
    idfactura?: number | null;
    idreservacion?: number | null;
    tipo_transaccion?: string;
    descripcion?: string | null;
    fecha_transaccion?: string | null;
  };

  if (!b?.tipo_transaccion) {
    return res.status(400).json({ error: "tipo_transaccion es requerido" });
  }
  if (b?.idfactura == null && b?.idreservacion == null) {
    return res.status(400).json({ error: "Debe enviar idfactura o idreservacion" });
  }

  try {
    const out = await prisma.$queryRawUnsafe<{ idtransaccion: number }[]>(
      `INSERT INTO dbo.transacciones
         (idfactura, idreservacion, tipo_transaccion, descripcion, fecha_transaccion)
       OUTPUT INSERTED.idtransaccion
       VALUES (@p1, @p2, @p3, @p4,
               CASE WHEN @p5 IS NULL THEN SYSDATETIME()
                    ELSE TRY_CONVERT(datetime2, @p5, 127) END)`,
      b.idfactura == null ? null : Number(b.idfactura),
      b.idreservacion == null ? null : Number(b.idreservacion),
      String(b.tipo_transaccion),
      b.descripcion ?? null,
      b.fecha_transaccion ?? null
    );

    const row = await prisma.$queryRaw<any[]>`
      SELECT t.idtransaccion, t.idfactura, t.idreservacion,
             t.tipo_transaccion, t.descripcion, t.fecha_transaccion
      FROM dbo.transacciones t
      WHERE t.idtransaccion = ${out[0].idtransaccion}`;
    res.status(201).json(row[0]);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

/* ======================================================
   PUT /api/transacciones/:id  (actualización parcial)
====================================================== */
transaccionesRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const b = req.body as {
    idfactura?: number | null;
    idreservacion?: number | null;
    tipo_transaccion?: string | null;
    descripcion?: string | null;
    fecha_transaccion?: string | null;
  };

  try {
    // ¡OJO con el ORDEN! Bandera y valor SIEMPRE juntos y en el mismo orden del SQL
    const sql = `
      UPDATE dbo.transacciones
      SET
        idfactura       = CASE WHEN @p2 = 1 THEN @p3 ELSE idfactura END,
        idreservacion   = CASE WHEN @p4 = 1 THEN @p5 ELSE idreservacion END,
        tipo_transaccion= CASE WHEN @p6 = 1 THEN @p7 ELSE tipo_transaccion END,
        descripcion     = CASE WHEN @p8 = 1 THEN @p9 ELSE descripcion END,
        fecha_transaccion = CASE
                              WHEN @p10 = 1 THEN TRY_CONVERT(datetime2, @p11, 127)
                              ELSE fecha_transaccion
                            END
      WHERE idtransaccion = @p1;
    `;

    const n = await prisma.$executeRawUnsafe(
      sql,
      // @p1 id
      id,
      // idfactura -> flag + valor
      has(b,"idfactura") ? 1 : 0, has(b,"idfactura") ? (b.idfactura == null ? null : Number(b.idfactura)) : null,
      // idreservacion
      has(b,"idreservacion") ? 1 : 0, has(b,"idreservacion") ? (b.idreservacion == null ? null : Number(b.idreservacion)) : null,
      // tipo_transaccion
      has(b,"tipo_transaccion") ? 1 : 0, has(b,"tipo_transaccion") ? (b.tipo_transaccion === null ? null : String(b.tipo_transaccion)) : null,
      // descripcion
      has(b,"descripcion") ? 1 : 0, has(b,"descripcion") ? (b.descripcion === null ? null : String(b.descripcion)) : null,
      // fecha_transaccion
      has(b,"fecha_transaccion") ? 1 : 0, has(b,"fecha_transaccion") ? (b.fecha_transaccion === null ? null : String(b.fecha_transaccion)) : null
    );

    if (n === 0) return res.status(404).json({ error: "no encontrado" });

    const row = await prisma.$queryRaw<any[]>`
      SELECT t.idtransaccion, t.idfactura, t.idreservacion,
             t.tipo_transaccion, t.descripcion, t.fecha_transaccion
      FROM dbo.transacciones t
      WHERE t.idtransaccion = ${id}`;
    res.json(row[0]);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

/* ======================================================
   DELETE /api/transacciones/:id
====================================================== */
transaccionesRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  try {
    const n = await prisma.$executeRaw`DELETE FROM dbo.transacciones WHERE idtransaccion=${id}`;
    if (n === 0) return res.status(404).json({ error: "no encontrado" });
    res.status(204).send();
  } catch {
    // Si en el futuro hay FK que impidan borrar, devolvemos 409
    res.status(409).json({ error: "No se puede eliminar: está referenciado." });
  }
});
