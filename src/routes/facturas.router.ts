// src/routes/facturas.router.ts
import { Router } from "express";
import { prisma } from "../db/prisma";

export const facturasRouter = Router();

/* Helpers */
const isInt = (v: unknown) => Number.isInteger(Number(v));
const has = (b: any, k: string) => Object.prototype.hasOwnProperty.call(b, k);

/* =====================================================
 *  GET /api/facturas?clienteId=&estadoPagoId=&reservacionId=&desde=&hasta=
 * ===================================================== */
facturasRouter.get("/", async (req, res) => {
  const clienteId      = typeof req.query.clienteId === "string" ? Number(req.query.clienteId) : null;
  const estadoPagoId   = typeof req.query.estadoPagoId === "string" ? Number(req.query.estadoPagoId) : null;
  const reservacionId  = typeof req.query.reservacionId === "string" ? Number(req.query.reservacionId) : null;
  const desde          = typeof req.query.desde === "string" ? req.query.desde : null;
  const hasta          = typeof req.query.hasta === "string" ? req.query.hasta : null;

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
/** =====================================================
 *  POST /api/facturas
 *  Query opcional: ?calcularIva=true&iva=0.12  (por defecto true, 12%)
 *  Requeridos: idusuario, idreservacion, idforma_pago, idestado_pago, monto_subtotal
 *  Opcionales: idcliente, observaciones, fecha_emision(ISO), monto_total (si calcularIva=false)
 * ===================================================== */
facturasRouter.post("/", async (req, res) => {
  const b = req.body as {
    idusuario?: number;
    idreservacion?: number;
    idcliente?: number | null;
    idforma_pago?: number;
    idestado_pago?: number;
    monto_subtotal?: number;
    monto_total?: number | null;      // solo si calcularIva=false
    observaciones?: string | null;
    fecha_emision?: string | null;    // ISO o null
  };

  // defaults: calcular IVA 12%
  const calcularIva = String(req.query.calcularIva ?? "true").toLowerCase() !== "false";
  const ivaRate = req.query.iva ? Number(req.query.iva) : 0.12;

  // Validaciones básicas
  if (![b?.idusuario, b?.idreservacion, b?.idforma_pago, b?.idestado_pago].every(v => Number.isInteger(Number(v)))) {
    return res.status(400).json({ error: "idusuario, idreservacion, idforma_pago, idestado_pago son requeridos y numéricos" });
  }
  if (typeof b?.monto_subtotal === "undefined") {
    return res.status(400).json({ error: "monto_subtotal es requerido" });
  }

  const idusuario      = Number(b.idusuario);
  const idreservacion  = Number(b.idreservacion);
  const idforma_pago   = Number(b.idforma_pago);
  const idestado_pago  = Number(b.idestado_pago);
  const idcliente      = b.idcliente == null ? null : Number(b.idcliente);
  const subtotal       = Number(b.monto_subtotal);
  const observaciones  = b.observaciones ?? null;
  const fechaISO       = b.fecha_emision ?? null;

  // Calcular IVA/TOTAL
  let iva = 0;
  let total: number | null = b.monto_total == null ? null : Number(b.monto_total);
  if (calcularIva) {
    iva   = +(subtotal * ivaRate).toFixed(2);
    total = +(subtotal + iva).toFixed(2);
  } else if (total == null) {
    return res.status(400).json({ error: "monto_total es requerido cuando calcularIva=false" });
  }

  try {
    // Validar FKs para devolver 400 en lugar de error SQL
    const [[u], [r], [fp], [ep], [c]] = await Promise.all([
      prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(1) n FROM dbo.usuarios WHERE idusuario=${idusuario}`,
      prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(1) n FROM dbo.reservaciones WHERE idreservacion=${idreservacion}`,
      prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(1) n FROM dbo.formas_pago WHERE idforma_pago=${idforma_pago}`,
      prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(1) n FROM dbo.estados_pago WHERE idestado_pago=${idestado_pago}`,
      idcliente == null
        ? Promise.resolve([{ n: 1 } as any]) // cliente opcional
        : prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(1) n FROM dbo.clientes WHERE idcliente=${idcliente}`
    ]);

    if (!u.n)  return res.status(400).json({ error: "idusuario no existe" });
    if (!r.n)  return res.status(400).json({ error: "idreservacion no existe" });
    if (!fp.n) return res.status(400).json({ error: "idforma_pago no existe" });
    if (!ep.n) return res.status(400).json({ error: "idestado_pago no existe" });
    if (!c.n)  return res.status(400).json({ error: "idcliente no existe" });

    // Insert seguro de tipos (fecha_emision se castea a nvarchar antes de TRY_CONVERT)
    const out = await prisma.$queryRawUnsafe<{ idfactura: number }[]>(
      `INSERT INTO dbo.facturas
        (idusuario, idreservacion, idcliente, idforma_pago, idestado_pago,
         monto_subtotal, monto_iva, monto_total, observaciones, fecha_emision)
       OUTPUT INSERTED.idfactura
       VALUES (@p1, @p2, @p3, @p4, @p5,
               @p6, @p7, @p8, @p9,
               CASE WHEN @p10 IS NULL THEN SYSDATETIME()
                    ELSE TRY_CONVERT(datetime2, CAST(@p10 AS nvarchar(50)), 127) END)`,
      idusuario,
      idreservacion,
      idcliente,
      idforma_pago,
      idestado_pago,
      subtotal,
      iva,               // nunca NULL
      total,             // ya sea calculado o enviado
      observaciones,
      fechaISO
    );

    const id = out[0].idfactura;
    const row = await prisma.$queryRaw<any[]>`
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
    return res.status(201).json(row[0]);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});








/* =====================================================
 *  PUT /api/facturas/:id  (parcial)
 *  Query opcional: ?calcularIva=true&iva=0.12 (si envías monto_subtotal)
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
    monto_iva?: number | null;     // ignorado si calcularIva=true
    monto_total?: number | null;   // ignorado si calcularIva=true
    observaciones?: string | null;
    fecha_emision?: string | null;
  };

  const calcularIva = String(req.query.calcularIva ?? "false").toLowerCase() === "true";
  const ivaRate = req.query.iva ? Number(req.query.iva) : 0.12;

  // Calculamos IVA/TOTAL si se envía subtotal y calcularIva=true
  let ms = has(b, "monto_subtotal") ? (b.monto_subtotal === null ? null : Number(b.monto_subtotal)) : undefined;
  let mi = has(b, "monto_iva")      ? (b.monto_iva === null ? null : Number(b.monto_iva))         : undefined;
  let mt = has(b, "monto_total")    ? (b.monto_total === null ? null : Number(b.monto_total))     : undefined;

  if (calcularIva && typeof ms !== "undefined" && ms !== null) {
    const iva = +(Number(ms) * ivaRate).toFixed(2);
    mi = iva;
    mt = +(Number(ms) + iva).toFixed(2);
  }

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
        monto_iva      = CASE WHEN @p14 = 1 THEN @p15 ELSE monto_iva      END,
        monto_total    = CASE WHEN @p16 = 1 THEN @p17 ELSE monto_total    END,
        observaciones  = CASE WHEN @p18 = 1 THEN @p19 ELSE observaciones  END,
        fecha_emision  = CASE
                           WHEN @p20 = 1 THEN TRY_CONVERT(datetime2, CAST(@p21 AS nvarchar(50)), 127)
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
      has(b, "monto_subtotal") ? 1 : 0, typeof ms === "undefined" ? null : ms,
      // monto_iva
      has(b, "monto_iva") ? 1 : 0, typeof mi === "undefined" ? null : mi,
      // monto_total
      has(b, "monto_total") ? 1 : 0, typeof mt === "undefined" ? null : mt,
      // observaciones
      has(b, "observaciones") ? 1 : 0, has(b, "observaciones") ? (b.observaciones === null ? null : String(b.observaciones)) : null,
      // fecha_emision
      has(b, "fecha_emision") ? 1 : 0, has(b, "fecha_emision") ? (b.fecha_emision === null ? null : String(b.fecha_emision)) : null
    );

    if (n === 0) return res.status(404).json({ error: "no encontrado" });

    const row = await prisma.$queryRaw<any[]>`
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
    res.json(row[0]);
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
