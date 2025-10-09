import { Router } from "express";
import { prisma } from "../db/prisma";

export const ingresosRouter = Router();

/* Helpers */
const isInt = (v: unknown) => Number.isInteger(Number(v));
const has = (b: any, k: string) => Object.prototype.hasOwnProperty.call(b, k);

/* ======================================================
   GET /api/ingresos
   Filtros opcionales:
   ?empresaId=&clienteId=&estadoId=&desde=ISO&hasta=ISO
   NOTA: empresaId se resuelve por la reservación
====================================================== */
ingresosRouter.get("/", async (req, res) => {
  const empresaId =
    typeof req.query.empresaId === "string" ? Number(req.query.empresaId) : null;
  const clienteId =
    typeof req.query.clienteId === "string" ? Number(req.query.clienteId) : null;
  const estadoId =
    typeof req.query.estadoId === "string" ? Number(req.query.estadoId) : null;
  const desde = typeof req.query.desde === "string" ? req.query.desde : null;
  const hasta = typeof req.query.hasta === "string" ? req.query.hasta : null;

  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT  f.idfactura, f.idusuario, f.idreservacion, f.idcliente,
              f.fecha_emision, f.monto_subtotal, f.monto_iva, f.monto_total,
              f.idforma_pago, f.idestado_pago, f.observaciones,
              c.nombre  AS cliente_nombre, c.apellido AS cliente_apellido,
              fp.descripcion AS forma_pago,
              ep.descripcion AS estado_pago,
              e.nombre AS empresa_nombre
      FROM dbo.facturas f
      LEFT JOIN dbo.reservaciones r ON r.idreservacion = f.idreservacion
      LEFT JOIN dbo.empresas      e ON e.idempresa     = r.idempresa
      LEFT JOIN dbo.clientes      c ON c.idcliente     = f.idcliente
      JOIN dbo.formas_pago       fp ON fp.idforma_pago = f.idforma_pago
      JOIN dbo.estados_pago      ep ON ep.idestado_pago= f.idestado_pago
      WHERE (@p1 IS NULL OR r.idempresa = @p1)
        AND (@p2 IS NULL OR f.idcliente = @p2)
        AND (@p3 IS NULL OR f.idestado_pago = @p3)
        AND (@p4 IS NULL OR f.fecha_emision >= TRY_CONVERT(datetime2, CAST(@p4 AS nvarchar(50)), 127))
        AND (@p5 IS NULL OR f.fecha_emision <= TRY_CONVERT(datetime2, CAST(@p5 AS nvarchar(50)), 127))
      ORDER BY f.idfactura DESC
      `,
      empresaId, clienteId, estadoId, desde, hasta
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* ======================================================
   GET /api/ingresos/:id
====================================================== */
ingresosRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT  f.idfactura, f.idusuario, f.idreservacion, f.idcliente,
              f.fecha_emision, f.monto_subtotal, f.monto_iva, f.monto_total,
              f.idforma_pago, f.idestado_pago, f.observaciones,
              c.nombre  AS cliente_nombre, c.apellido AS cliente_apellido,
              fp.descripcion AS forma_pago,
              ep.descripcion AS estado_pago,
              e.nombre AS empresa_nombre
      FROM dbo.facturas f
      LEFT JOIN dbo.reservaciones r ON r.idreservacion = f.idreservacion
      LEFT JOIN dbo.empresas      e ON e.idempresa     = r.idempresa
      LEFT JOIN dbo.clientes      c ON c.idcliente     = f.idcliente
      JOIN dbo.formas_pago       fp ON fp.idforma_pago = f.idforma_pago
      JOIN dbo.estados_pago      ep ON ep.idestado_pago= f.idestado_pago
      WHERE f.idfactura = ${id}`;
    if (!rows.length) return res.status(404).json({ error: "no encontrado" });
    res.json(rows[0]);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

/* ======================================================
   POST /api/ingresos  (dbo.facturas)
   Requeridos: idusuario, idforma_pago, idestado_pago, monto_subtotal, monto_iva, monto_total
   Opcionales: idreservacion, idcliente, fecha_emision, observaciones
====================================================== */
ingresosRouter.post("/", async (req, res) => {
  const b = req.body as {
    idusuario?: number;
    idreservacion?: number | null;
    idcliente?: number | null;
    idforma_pago?: number;
    idestado_pago?: number;
    monto_subtotal?: number;
    monto_iva?: number;
    monto_total?: number;
    fecha_emision?: string | null;
    observaciones?: string | null;
  };

  if (
    !isInt(b?.idusuario) ||
    !isInt(b?.idforma_pago) ||
    !isInt(b?.idestado_pago) ||
    typeof b?.monto_subtotal === "undefined" ||
    typeof b?.monto_iva === "undefined" ||
    typeof b?.monto_total === "undefined"
  ) {
    return res.status(400).json({
      error:
        "idusuario, idforma_pago, idestado_pago, monto_subtotal, monto_iva y monto_total son requeridos",
    });
  }

  try {
    const out = await prisma.$queryRawUnsafe<{ idfactura: number }[]>(
      `
      INSERT INTO dbo.facturas
        (idusuario, idreservacion, idcliente, fecha_emision,
         monto_subtotal, monto_iva, monto_total,
         idforma_pago, idestado_pago, observaciones)
      OUTPUT INSERTED.idfactura
      VALUES
        (@p1, @p2, @p3,
         CASE WHEN @p4 IS NULL THEN SYSDATETIME()
              ELSE TRY_CONVERT(datetime2, @p4, 127) END,
         @p5, @p6, @p7,
         @p8, @p9, @p10)
      `,
      Number(b.idusuario),
      b.idreservacion == null ? null : Number(b.idreservacion),
      b.idcliente == null ? null : Number(b.idcliente),
      b.fecha_emision ?? null,
      Number(b.monto_subtotal),
      Number(b.monto_iva),
      Number(b.monto_total),
      Number(b.idforma_pago),
      Number(b.idestado_pago),
      b.observaciones ?? null
    );

    const row = await prisma.$queryRaw<any[]>`
      SELECT  f.idfactura, f.idusuario, f.idreservacion, f.idcliente,
              f.fecha_emision, f.monto_subtotal, f.monto_iva, f.monto_total,
              f.idforma_pago, f.idestado_pago, f.observaciones,
              c.nombre  AS cliente_nombre, c.apellido AS cliente_apellido,
              fp.descripcion AS forma_pago,
              ep.descripcion AS estado_pago,
              e.nombre AS empresa_nombre
      FROM dbo.facturas f
      LEFT JOIN dbo.reservaciones r ON r.idreservacion = f.idreservacion
      LEFT JOIN dbo.empresas      e ON e.idempresa     = r.idempresa
      LEFT JOIN dbo.clientes      c ON c.idcliente     = f.idcliente
      JOIN dbo.formas_pago       fp ON fp.idforma_pago = f.idforma_pago
      JOIN dbo.estados_pago      ep ON ep.idestado_pago= f.idestado_pago
      WHERE f.idfactura = ${out[0].idfactura}`;
    res.status(201).json(row[0]);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});



// PUT /api/ingresos/:id  (actualización parcial, tabla: dbo.facturas)
ingresosRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const b = req.body as {
    idusuario?: number;
    idreservacion?: number | null;
    idcliente?: number;
    idforma_pago?: number;
    idestado_pago?: number;
    monto_subtotal?: number;
    monto_iva?: number;
    monto_total?: number;
    fecha_emision?: string | null;   // ISO string o null
    observaciones?: string | null;
  };
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);

  try {
    // 1) UPDATE de campos "seguros" (sin 'observaciones')
    const sqlCore = `
      UPDATE dbo.facturas
      SET
        idusuario      = CASE WHEN @p2  = 1 THEN @p3  ELSE idusuario      END,
        idreservacion  = CASE WHEN @p4  = 1 THEN @p5  ELSE idreservacion  END,
        idcliente      = CASE WHEN @p6  = 1 THEN @p7  ELSE idcliente      END,
        idforma_pago   = CASE WHEN @p8  = 1 THEN @p9  ELSE idforma_pago   END,
        idestado_pago  = CASE WHEN @p10 = 1 THEN @p11 ELSE idestado_pago  END,
        monto_subtotal = CASE WHEN @p12 = 1 THEN @p13 ELSE monto_subtotal END,
        monto_iva      = CASE WHEN @p14 = 1 THEN @p15 ELSE monto_iva      END,
        monto_total    = CASE WHEN @p16 = 1 THEN @p17 ELSE monto_total    END,
        fecha_emision  = CASE 
                           WHEN @p18 = 1 
                             THEN TRY_CONVERT(datetime2, CAST(@p19 AS nvarchar(50)), 127)
                           ELSE fecha_emision
                         END
      WHERE idfactura = @p1;
    `;

    const n1 = await prisma.$executeRawUnsafe(
      sqlCore,
      // @p1
      id,
      // idusuario
      has("idusuario") ? 1 : 0, has("idusuario") ? Number(b.idusuario) : null,
      // idreservacion
      has("idreservacion") ? 1 : 0, has("idreservacion") ? (b.idreservacion == null ? null : Number(b.idreservacion)) : null,
      // idcliente
      has("idcliente") ? 1 : 0, has("idcliente") ? Number(b.idcliente) : null,
      // idforma_pago
      has("idforma_pago") ? 1 : 0, has("idforma_pago") ? Number(b.idforma_pago) : null,
      // idestado_pago
      has("idestado_pago") ? 1 : 0, has("idestado_pago") ? Number(b.idestado_pago) : null,
      // monto_subtotal
      has("monto_subtotal") ? 1 : 0, has("monto_subtotal") ? Number(b.monto_subtotal) : null,
      // monto_iva
      has("monto_iva") ? 1 : 0, has("monto_iva") ? Number(b.monto_iva) : null,
      // monto_total
      has("monto_total") ? 1 : 0, has("monto_total") ? Number(b.monto_total) : null,
      // fecha_emision
      has("fecha_emision") ? 1 : 0, has("fecha_emision") ? (b.fecha_emision === null ? null : String(b.fecha_emision)) : null
    );

    if (n1 === 0) return res.status(404).json({ error: "no encontrado" });

// 2) UPDATE separado para 'observaciones' (columna TEXT)
if (has("observaciones")) {
  // Nota: usamos un flag para controlar NULL y casteamos el valor a NVARCHAR(MAX)
  await prisma.$executeRawUnsafe(
    `
    UPDATE dbo.facturas
    SET observaciones = CASE 
                          WHEN @p2_is_null = 1 THEN NULL 
                          ELSE CAST(@p2 AS nvarchar(max)) 
                        END
    WHERE idfactura = @p1;
    `,
    id,
    b.observaciones === null ? 1 : 0,               // @p2_is_null
    b.observaciones === null ? "" : String(b.observaciones) // @p2
  );
}


    // 3) Devolver la fila actualizada
    const row = await prisma.$queryRaw<any[]>`
      SELECT f.idfactura, f.idusuario, f.idreservacion, f.idcliente,
             f.idforma_pago, f.idestado_pago,
             f.monto_subtotal, f.monto_iva, f.monto_total,
             f.fecha_emision, f.observaciones,
             fp.descripcion AS forma_pago,
             ep.descripcion AS estado_pago
      FROM dbo.facturas f
      JOIN dbo.formas_pago   fp ON fp.idforma_pago  = f.idforma_pago
      JOIN dbo.estados_pago  ep ON ep.idestado_pago = f.idestado_pago
      WHERE f.idfactura = ${id}`;
    res.json(row[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});






/* ======================================================
   DELETE /api/ingresos/:id  (dbo.facturas)
====================================================== */
ingresosRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });
  try {
    const n = await prisma.$executeRaw`DELETE FROM dbo.facturas WHERE idfactura=${id}`;
    if (n === 0) return res.status(404).json({ error: "no encontrado" });
    res.status(204).send();
  } catch {
    res.status(409).json({ error: "No se puede eliminar: está referenciado." });
  }
});
