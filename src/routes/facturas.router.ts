// src/routes/facturas.router.ts
import { Router } from "express";
import { prisma } from "../db/prisma";

export const facturasRouter = Router();

/* Helpers */
const has = (b: any, k: string) => Object.prototype.hasOwnProperty.call(b, k);

/* =====================================================
 *  GET /api/facturas?clienteId=&estadoPagoId=&reservacionId=&desde=&hasta=
 * ===================================================== */
facturasRouter.get("/", async (req, res) => {
  const clienteId     = typeof req.query.clienteId === "string" ? Number(req.query.clienteId) : null;
  const estadoPagoId  = typeof req.query.estadoPagoId === "string" ? Number(req.query.estadoPagoId) : null;
  const reservacionId = typeof req.query.reservacionId === "string" ? Number(req.query.reservacionId) : null;
  const desde         = typeof req.query.desde === "string" ? req.query.desde : null;
  const hasta         = typeof req.query.hasta === "string" ? req.query.hasta : null;

  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT f.idfactura, f.idusuario, f.idreservacion, f.idcliente,
              f.idforma_pago, f.idestado_pago,
              f.monto_subtotal, f.monto_iva, f.monto_total,
              f.observaciones, f.fecha_emision,
              ep.descripcion AS estado_pago, fp.descripcion AS forma_pago,
              u.correo AS usuario_correo,
              c.nombre AS cliente_nombre, c.apellido AS cliente_apellido
       FROM dbo.facturas f
       JOIN dbo.estados_pago ep ON ep.idestado_pago = f.idestado_pago
       JOIN dbo.formas_pago  fp ON fp.idforma_pago  = f.idforma_pago
       JOIN dbo.usuarios     u  ON u.idusuario     = f.idusuario
       LEFT JOIN dbo.clientes c ON c.idcliente     = f.idcliente
       WHERE (@p1 IS NULL OR f.idcliente = @p1)
         AND (@p2 IS NULL OR f.idestado_pago = @p2)
         AND (@p3 IS NULL OR f.idreservacion = @p3)
         AND (@p4 IS NULL OR f.fecha_emision >= TRY_CONVERT(datetime2, CAST(@p4 AS nvarchar(50)), 127))
         AND (@p5 IS NULL OR f.fecha_emision <= TRY_CONVERT(datetime2, CAST(@p5 AS nvarchar(50)), 127))
       ORDER BY f.idfactura DESC`,
      clienteId, estadoPagoId, reservacionId, desde, hasta
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* =====================================================
 *  GET /api/facturas/:id
 * ===================================================== */
facturasRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT f.idfactura, f.idusuario, f.idreservacion, f.idcliente,
             f.idforma_pago, f.idestado_pago,
             f.monto_subtotal, f.monto_iva, f.monto_total,
             f.observaciones, f.fecha_emision,
             ep.descripcion AS estado_pago, fp.descripcion AS forma_pago,
             u.correo AS usuario_correo,
             c.nombre AS cliente_nombre, c.apellido AS cliente_apellido
      FROM dbo.facturas f
      JOIN dbo.estados_pago ep ON ep.idestado_pago = f.idestado_pago
      JOIN dbo.formas_pago  fp ON fp.idforma_pago  = f.idforma_pago
      JOIN dbo.usuarios     u  ON u.idusuario     = f.idusuario
      LEFT JOIN dbo.clientes c ON c.idcliente     = f.idcliente
      WHERE f.idfactura = ${id}`;
    if (!rows.length) return res.status(404).json({ error: "no encontrado" });
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* =====================================================
 *  POST /api/facturas
 *  Requeridos: idusuario, idforma_pago, idestado_pago
 *  Uno de: (A) idreservacion  ó  (B) monto_subtotal
 * ===================================================== */
facturasRouter.post("/", async (req, res) => {
  const b = req.body as {
    idusuario?: number;
    idreservacion?: number | null;
    idcliente?: number | null;
    idforma_pago?: number;
    idestado_pago?: number;
    monto_subtotal?: number | null;
    observaciones?: string | null;
    fecha_emision?: string | null;
  };

  if (![b?.idusuario, b?.idforma_pago, b?.idestado_pago].every(v => Number.isInteger(Number(v)))) {
    return res.status(400).json({ error: "idusuario, idforma_pago e idestado_pago son requeridos y numéricos" });
  }

  const tieneReservacion = b.idreservacion != null;
  const tieneSubtotal    = typeof b.monto_subtotal !== "undefined" && b.monto_subtotal !== null;
  if (!tieneReservacion && !tieneSubtotal) {
    return res.status(400).json({ error: "Debe enviar idreservacion o monto_subtotal" });
  }

  const idusuario     = Number(b.idusuario);
  const idreservacion = tieneReservacion ? Number(b.idreservacion) : null;
  const idforma_pago  = Number(b.idforma_pago);
  const idestado_pago = Number(b.idestado_pago);
  const idcliente     = b.idcliente == null ? null : Number(b.idcliente);
  const observaciones = b.observaciones ?? null;
  const fechaISO      = b.fecha_emision ?? null;

  try {
    // Validaciones de FK
    const [u, r, fp, ep, c] = (await Promise.all([
      prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(1) n FROM dbo.usuarios WHERE idusuario=${idusuario}`,
      idreservacion == null
        ? Promise.resolve([{ n: 1 } as any])
        : prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(1) n FROM dbo.reservaciones WHERE idreservacion=${idreservacion}`,
      prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(1) n FROM dbo.formas_pago WHERE idforma_pago=${idforma_pago}`,
      prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(1) n FROM dbo.estados_pago WHERE idestado_pago=${idestado_pago}`,
      idcliente == null
        ? Promise.resolve([{ n: 1 } as any])
        : prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(1) n FROM dbo.clientes WHERE idcliente=${idcliente}`,
    ])).map(x => x[0]);

    if (!u.n)  return res.status(400).json({ error: "idusuario no existe" });
    if (!r.n)  return res.status(400).json({ error: "idreservacion no existe" });
    if (!fp.n) return res.status(400).json({ error: "idforma_pago no existe" });
    if (!ep.n) return res.status(400).json({ error: "idestado_pago no existe" });
    if (!c.n)  return res.status(400).json({ error: "idcliente no existe" });

    // Subtotal a usar (NUNCA NULL, la columna es NOT NULL)
    let subtotalUsar: number;
    if (tieneSubtotal) {
      subtotalUsar = Number(b.monto_subtotal);
    } else {
      const rowRes = await prisma.$queryRaw<{ monto_total: number | null }[]>`
        SELECT monto_total FROM dbo.reservaciones WHERE idreservacion=${idreservacion}`;
      if (!rowRes.length) return res.status(400).json({ error: "Reservación no encontrada" });
      if (rowRes[0].monto_total == null) {
        return res.status(400).json({ error: "La reservación aún no tiene monto_total calculado (debe estar cerrada)" });
      }
      subtotalUsar = Number(rowRes[0].monto_total);
    }

    const rows = await prisma.$queryRawUnsafe<{ idfactura: number }[]>(`
      DECLARE @ids TABLE (idfactura INT);

      INSERT INTO dbo.facturas
        (idusuario, idreservacion, idcliente, idforma_pago, idestado_pago,
         monto_subtotal, monto_iva, monto_total, observaciones, fecha_emision)
      OUTPUT INSERTED.idfactura INTO @ids(idfactura)
      VALUES (@p1, @p2, @p3, @p4, @p5,
              @p6, 0, 0, @p7,
              CASE WHEN @p8 IS NULL THEN SYSDATETIME()
                   ELSE TRY_CONVERT(datetime2, CAST(@p8 AS nvarchar(50)), 127) END);

      SELECT idfactura FROM @ids;
      `,
      idusuario,
      idreservacion,
      idcliente,
      idforma_pago,
      idestado_pago,
      subtotalUsar,
      observaciones,
      fechaISO
    );

    const id = rows[0].idfactura;

    const facturaRows = await prisma.$queryRaw<any[]>`
      SELECT f.idfactura, f.idusuario, f.idreservacion, f.idcliente,
             f.idforma_pago, f.idestado_pago,
             f.monto_subtotal, f.monto_iva, f.monto_total,
             f.observaciones, f.fecha_emision,
             ep.descripcion AS estado_pago, fp.descripcion AS forma_pago,
             u.correo AS usuario_correo,
             c.nombre AS cliente_nombre, c.apellido AS cliente_apellido
      FROM dbo.facturas f
      JOIN dbo.estados_pago ep ON ep.idestado_pago = f.idestado_pago
      JOIN dbo.formas_pago  fp ON fp.idforma_pago  = f.idforma_pago
      JOIN dbo.usuarios     u  ON u.idusuario     = f.idusuario
      LEFT JOIN dbo.clientes c ON c.idcliente     = f.idcliente
      WHERE f.idfactura = ${id}`;

    if (!facturaRows.length) {
      return res.status(404).json({ error: "no encontrado" });
    }

    const factura = facturaRows[0];

    // --- NUEVO: si la factura está cancelada y tiene reservación,
    //            actualizar reservación a 'cancelado' y lugar a 'Libre'
    if (
      factura.idreservacion &&
      typeof factura.estado_pago === "string" &&
      factura.estado_pago.toLowerCase().startsWith("cancel")
    ) {
      // 1) reservación -> cancelado
      await prisma.$executeRawUnsafe(
        `UPDATE dbo.reservaciones SET estado_reservacion = 'cancelado' WHERE idreservacion = @p1`,
        factura.idreservacion
      );

      // 2) obtener idestado de 'Libre'
      const libreRows = await prisma.$queryRaw<{ idestado: number }[]>`
        SELECT TOP (1) idestado FROM dbo.estados_lugares WHERE estado = 'Libre'`;
      if (libreRows.length) {
        const idEstadoLibre = libreRows[0].idestado;

        // 3) lugar asociado -> Libre
        await prisma.$executeRaw`
          UPDATE dbo.lugares_estacionamiento
          SET idestado = ${idEstadoLibre}
          WHERE idlugar = (
            SELECT idlugar
            FROM dbo.reservaciones
            WHERE idreservacion = ${factura.idreservacion}
          )`;
      }
    }

    return res.status(201).json(factura);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/* =====================================================
 *  PUT /api/facturas/:id  (parcial)
 * ===================================================== */
facturasRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const b = req.body as {
    idusuario?: number;
    idreservacion?: number | null;
    idcliente?: number | null;
    idforma_pago?: number;
    idestado_pago?: number;
    monto_subtotal?: number | null;
    observaciones?: string | null;
    fecha_emision?: string | null;
  };

  try {
    const sql = `
      UPDATE dbo.facturas
      SET
        idusuario      = CASE WHEN @p2  = 1 THEN @p3  ELSE idusuario      END,
        idreservacion  = CASE WHEN @p4  = 1 THEN @p5  ELSE idreservacion  END,
        idcliente      = CASE WHEN @p6  = 1 THEN @p7  ELSE idcliente      END,
        idforma_pago   = CASE WHEN @p8  = 1 THEN @p9  ELSE idforma_pago   END,
        idestado_pago  = CASE WHEN @p10 = 1 THEN @p11 ELSE idestado_pago  END,
        monto_subtotal = CASE WHEN @p12 = 1 THEN @p13 ELSE monto_subtotal END,
        observaciones  = CASE WHEN @p14 = 1 THEN @p15 ELSE observaciones  END,
        fecha_emision  = CASE
                           WHEN @p16 = 1 THEN TRY_CONVERT(datetime2, CAST(@p17 AS nvarchar(50)), 127)
                           ELSE fecha_emision
                         END
      WHERE idfactura = @p1;
    `;

    const n = await prisma.$executeRawUnsafe(
      sql,
      id,
      // idusuario
      has(b, "idusuario") ? 1 : 0, has(b, "idusuario") ? Number(b.idusuario) : null,
      // idreservacion
      has(b, "idreservacion") ? 1 : 0, has(b, "idreservacion") ? (b.idreservacion == null ? null : Number(b.idreservacion)) : null,
      // idcliente
      has(b, "idcliente") ? 1 : 0, has(b, "idcliente") ? (b.idcliente == null ? null : Number(b.idcliente)) : null,
      // idforma_pago
      has(b, "idforma_pago") ? 1 : 0, has(b, "idforma_pago") ? Number(b.idforma_pago) : null,
      // idestado_pago
      has(b, "idestado_pago") ? 1 : 0, has(b, "idestado_pago") ? Number(b.idestado_pago) : null,
      // monto_subtotal
      (has(b, "monto_subtotal") && b.monto_subtotal !== null) ? 1 : 0,
      (has(b, "monto_subtotal") && b.monto_subtotal !== null) ? Number(b.monto_subtotal) : null,
      // observaciones
      has(b, "observaciones") ? 1 : 0, has(b, "observaciones") ? (b.observaciones === null ? null : String(b.observaciones)) : null,
      // fecha_emision
      has(b, "fecha_emision") ? 1 : 0, has(b, "fecha_emision") ? (b.fecha_emision === null ? null : String(b.fecha_emision)) : null
    );

    if (n === 0) return res.status(404).json({ error: "no encontrado" });

    const facturaRows = await prisma.$queryRaw<any[]>`
      SELECT f.idfactura, f.idusuario, f.idreservacion, f.idcliente,
             f.idforma_pago, f.idestado_pago,
             f.monto_subtotal, f.monto_iva, f.monto_total,
             f.observaciones, f.fecha_emision,
             ep.descripcion AS estado_pago, fp.descripcion AS forma_pago,
             u.correo AS usuario_correo,
             c.nombre AS cliente_nombre, c.apellido AS cliente_apellido
      FROM dbo.facturas f
      JOIN dbo.estados_pago ep ON ep.idestado_pago = f.idestado_pago
      JOIN dbo.formas_pago  fp ON fp.idforma_pago  = f.idforma_pago
      JOIN dbo.usuarios     u  ON u.idusuario     = f.idusuario
      LEFT JOIN dbo.clientes c ON c.idcliente     = f.idcliente
      WHERE f.idfactura = ${id}`;

    if (!facturaRows.length) {
      return res.status(404).json({ error: "no encontrado" });
    }

    const factura = facturaRows[0];

    // --- NUEVO: si la factura está cancelada y tiene reservación,
    //            actualizar reservación a 'cancelado' y lugar a 'Libre'
    if (
      factura.idreservacion &&
      typeof factura.estado_pago === "string" &&
      factura.estado_pago.toLowerCase().startsWith("cancel")
    ) {
      // 1) reservación -> cancelado
      await prisma.$executeRawUnsafe(
        `UPDATE dbo.reservaciones SET estado_reservacion = 'cancelado' WHERE idreservacion = @p1`,
        factura.idreservacion
      );

      // 2) obtener idestado de 'Libre'
      const libreRows = await prisma.$queryRaw<{ idestado: number }[]>`
        SELECT TOP (1) idestado FROM dbo.estados_lugares WHERE estado = 'Libre'`;
      if (libreRows.length) {
        const idEstadoLibre = libreRows[0].idestado;

        // 3) lugar asociado -> Libre
        await prisma.$executeRaw`
          UPDATE dbo.lugares_estacionamiento
          SET idestado = ${idEstadoLibre}
          WHERE idlugar = (
            SELECT idlugar
            FROM dbo.reservaciones
            WHERE idreservacion = ${factura.idreservacion}
          )`;
      }
    }

    res.json(factura);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* =====================================================
 *  DELETE /api/facturas/:id
 * ===================================================== */
facturasRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });
  try {
    const n = await prisma.$executeRaw`DELETE FROM dbo.facturas WHERE idfactura=${id}`;
    if (n === 0) return res.status(404).json({ error: "no encontrado" });
    res.status(204).send();
  } catch {
    res.status(409).json({ error: "No se puede eliminar: tiene ingresos/transacciones asociadas." });
  }
});
