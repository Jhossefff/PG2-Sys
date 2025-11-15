// src/routes/reservaciones.router.ts
import { Router } from "express";
import { prisma } from "../db/prisma";

export const reservacionesRouter = Router();

/* Estados permitidos: DEBEN coincidir con el CHECK de la BD */
const ESTADOS_VALIDOS = [
  "reservado",
  "confirmado",
  "pendiente",
  "cancelado",
  "completado", // <- nuevo estado final
] as const;
type Estado = (typeof ESTADOS_VALIDOS)[number];

const isInt = (v: unknown) => Number.isInteger(Number(v));
const has = (b: any, k: string) => Object.prototype.hasOwnProperty.call(b, k);

/* =========================
   GET /api/reservaciones
========================= */
reservacionesRouter.get("/", async (req, res) => {
  const empresaId =
    typeof req.query.empresaId === "string" ? Number(req.query.empresaId) : null;
  const clienteId =
    typeof req.query.clienteId === "string" ? Number(req.query.clienteId) : null;
  const estado =
    typeof req.query.estado === "string"
      ? req.query.estado.toString().toLowerCase().trim()
      : null;
  const desde = typeof req.query.desde === "string" ? req.query.desde : null;
  const hasta = typeof req.query.hasta === "string" ? req.query.hasta : null;

  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT r.idreservacion, r.idusuario, r.idempresa, r.idtarifa, r.idcliente, r.idlugar,
              r.fecha_reservacion, r.hora_entrada, r.hora_salida, r.estado_reservacion, r.monto_total,
              e.nombre AS empresa_nombre,
              c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
              l.nombre AS lugar_nombre,
              t.tipo_vehiculo
       FROM dbo.reservaciones r
       JOIN dbo.empresas e ON e.idempresa = r.idempresa
       JOIN dbo.clientes c ON c.idcliente = r.idcliente
       JOIN dbo.lugares_estacionamiento l ON l.idlugar = r.idlugar
       JOIN dbo.tarifas t ON t.idtarifa = r.idtarifa
       WHERE (@p1 IS NULL OR r.idempresa = @p1)
         AND (@p2 IS NULL OR r.idcliente = @p2)
         AND (@p3 IS NULL OR LOWER(r.estado_reservacion) = @p3)
         AND (@p4 IS NULL OR r.fecha_reservacion >= TRY_CONVERT(datetime2, CAST(@p4 AS nvarchar(50)), 127))
         AND (@p5 IS NULL OR r.fecha_reservacion <= TRY_CONVERT(datetime2, CAST(@p5 AS nvarchar(50)), 127))
       ORDER BY r.idreservacion DESC`,
      empresaId,
      clienteId,
      estado,
      desde,
      hasta
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   GET /api/reservaciones/:id
========================= */
reservacionesRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT r.*, e.nombre AS empresa_nombre, c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
             l.nombre AS lugar_nombre, t.tipo_vehiculo
      FROM dbo.reservaciones r
      JOIN dbo.empresas e ON e.idempresa = r.idempresa
      JOIN dbo.clientes c ON c.idcliente = r.idcliente
      JOIN dbo.lugares_estacionamiento l ON l.idlugar = r.idlugar
      JOIN dbo.tarifas t ON t.idtarifa = r.idtarifa
      WHERE r.idreservacion = ${id}`;
    if (!rows.length) return res.status(404).json({ error: "no encontrado" });
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   POST /api/reservaciones
   - crea en "confirmado"
   - si no mandan hora_entrada => SYSDATETIME()
========================= */
reservacionesRouter.post("/", async (req, res) => {
  const b = req.body as {
    idusuario?: number;
    idempresa?: number;
    idtarifa?: number;
    idcliente?: number;
    idlugar?: number;
    estado_reservacion?: Estado | string;
    hora_entrada?: string | null;
    hora_salida?: string | null;
    monto_total?: number | null;
  };

  if (![b?.idusuario, b?.idempresa, b?.idtarifa, b?.idcliente, b?.idlugar].every(isInt)) {
    return res
      .status(400)
      .json({
        error:
          "Faltan IDs requeridos (idusuario, idempresa, idtarifa, idcliente, idlugar)",
      });
  }

  const estado: Estado = "confirmado";
  const entradaISO = b.hora_entrada ?? null;
  const salidaISO = null;

  try {
    const out = await prisma.$queryRawUnsafe<{ idreservacion: number }[]>(
      `
      DECLARE @out TABLE(idreservacion INT);

      INSERT INTO dbo.reservaciones
        (idusuario, idempresa, idtarifa, idcliente, idlugar, estado_reservacion,
         fecha_reservacion, hora_entrada, hora_salida, monto_total)
      OUTPUT INSERTED.idreservacion INTO @out
      VALUES (@p1, @p2, @p3, @p4, @p5, @p6,
              SYSDATETIME(),
              COALESCE(TRY_CONVERT(datetime2, CAST(@p7 AS nvarchar(50)), 127), SYSDATETIME()),
              TRY_CONVERT(datetime2, CAST(@p8 AS nvarchar(50)), 127),
              NULL);

      SELECT idreservacion FROM @out;
    `,
      Number(b.idusuario),
      Number(b.idempresa),
      Number(b.idtarifa),
      Number(b.idcliente),
      Number(b.idlugar),
      estado,
      entradaISO,
      salidaISO
    );

    const id = out[0].idreservacion;
    const row = await prisma.$queryRaw<any[]>`
      SELECT r.*, e.nombre AS empresa_nombre, c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
             l.nombre AS lugar_nombre, t.tipo_vehiculo
      FROM dbo.reservaciones r
      JOIN dbo.empresas e ON e.idempresa = r.idempresa
      JOIN dbo.clientes c ON c.idcliente = r.idcliente
      JOIN dbo.lugares_estacionamiento l ON l.idlugar = r.idlugar
      JOIN dbo.tarifas t ON t.idtarifa = r.idtarifa
      WHERE r.idreservacion = ${id}`;

    if (!row.length) {
      return res.status(404).json({ error: "no encontrado" });
    }

    const reservacion = row[0];

    // ==== NUEVO: marcar lugar como Ocupado al crear la reservación (si no está cancelada) ====
    if (
      reservacion.idlugar &&
      typeof reservacion.estado_reservacion === "string" &&
      reservacion.estado_reservacion.toLowerCase() !== "cancelado"
    ) {
      const ocupados = await prisma.$queryRaw<{ idestado: number }[]>`
        SELECT TOP (1) idestado
        FROM dbo.estados_lugares
        WHERE LOWER(estado) = 'ocupado'`;

      if (ocupados.length) {
        const idEstadoOcupado = ocupados[0].idestado;
        await prisma.$executeRaw`
          UPDATE dbo.lugares_estacionamiento
          SET idestado = ${idEstadoOcupado}
          WHERE idlugar = ${reservacion.idlugar}`;
      }
    }
    // ==== FIN NUEVO ====

    res.status(201).json(reservacion);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   PUT /api/reservaciones/:id
   - valida contra CHECK (incluye 'completado')
   - si cambia a 'pendiente'/'reservado' y no envían hora_salida => NULL
========================= */
reservacionesRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  const b = req.body as {
    idusuario?: number;
    idempresa?: number;
    idtarifa?: number;
    idcliente?: number;
    idlugar?: number;
    estado_reservacion?: Estado | string;
    hora_entrada?: string | null;
    hora_salida?: string | null;
    monto_total?: number | null;
  };

  if (has(b, "monto_total")) {
    return res
      .status(400)
      .json({ error: "monto_total es de solo lectura y lo calcula el sistema" });
  }

  // validar estado si viene
  let estadoViene: Estado | undefined;
  if (has(b, "estado_reservacion") && b.estado_reservacion != null) {
    const v = String(b.estado_reservacion).trim().toLowerCase();
    if (!ESTADOS_VALIDOS.includes(v as Estado)) {
      return res.status(400).json({ error: "estado_reservacion inválido" });
    }
    estadoViene = v as Estado;
  }

  const sets: string[] = [];
  const params: any[] = [];

  if (has(b, "idusuario")) {
    sets.push(`idusuario = @p${params.length + 1}`);
    params.push(b.idusuario == null ? null : Number(b.idusuario));
  }
  if (has(b, "idempresa")) {
    sets.push(`idempresa = @p${params.length + 1}`);
    params.push(b.idempresa == null ? null : Number(b.idempresa));
  }
  if (has(b, "idtarifa")) {
    sets.push(`idtarifa  = @p${params.length + 1}`);
    params.push(b.idtarifa == null ? null : Number(b.idtarifa));
  }
  if (has(b, "idcliente")) {
    sets.push(`idcliente = @p${params.length + 1}`);
    params.push(b.idcliente == null ? null : Number(b.idcliente));
  }
  if (has(b, "idlugar")) {
    sets.push(`idlugar   = @p${params.length + 1}`);
    params.push(b.idlugar == null ? null : Number(b.idlugar));
  }

  if (has(b, "estado_reservacion")) {
    sets.push(`estado_reservacion = @p${params.length + 1}`);
    params.push(estadoViene ?? null);
  }

  const vieneEntrada = has(b, "hora_entrada");
  const vieneSalida = has(b, "hora_salida");

  if (vieneEntrada) {
    if (b.hora_entrada === null) {
      sets.push(`hora_entrada = NULL`);
    } else {
      sets.push(
        `hora_entrada = TRY_CONVERT(datetime2, CAST(@p${params.length + 1} AS nvarchar(50)), 127)`
      );
      params.push(String(b.hora_entrada));
    }
  }

  if (
    estadoViene &&
    (estadoViene === "pendiente" || estadoViene === "reservado") &&
    !vieneSalida
  ) {
    sets.push(`hora_salida = NULL`);
  } else if (vieneSalida) {
    if (b.hora_salida === null) {
      sets.push(`hora_salida = NULL`);
    } else {
      sets.push(
        `hora_salida = TRY_CONVERT(datetime2, CAST(@p${params.length + 1} AS nvarchar(50)), 127)`
      );
      params.push(String(b.hora_salida));
    }
  }

  if (sets.length === 0)
    return res.status(400).json({ error: "nada para actualizar" });

  const sql = `
    UPDATE dbo.reservaciones
       SET ${sets.join(", ")}
     WHERE idreservacion = @p${params.length + 1};
  `;
  params.push(id);

  try {
    const n = await prisma.$executeRawUnsafe(sql, ...params);
    if (n === 0) return res.status(404).json({ error: "no encontrado" });

    const row = await prisma.$queryRaw<any[]>`
      SELECT r.*, e.nombre AS empresa_nombre, c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
             l.nombre AS lugar_nombre, t.tipo_vehiculo
      FROM dbo.reservaciones r
      JOIN dbo.empresas e ON e.idempresa = r.idempresa
      JOIN dbo.clientes c ON c.idcliente = r.idcliente
      JOIN dbo.lugares_estacionamiento l ON l.idlugar = r.idlugar
      JOIN dbo.tarifas t ON t.idtarifa = r.idtarifa
      WHERE r.idreservacion = ${id}`;

    if (!row.length) {
      return res.status(404).json({ error: "no encontrado" });
    }

    const reservacion = row[0];

    // ==== NUEVO: marcar lugar como Ocupado al actualizar reservación (si no está cancelada) ====
    if (
      reservacion.idlugar &&
      typeof reservacion.estado_reservacion === "string" &&
      reservacion.estado_reservacion.toLowerCase() !== "cancelado"
    ) {
      const ocupados = await prisma.$queryRaw<{ idestado: number }[]>`
        SELECT TOP (1) idestado
        FROM dbo.estados_lugares
        WHERE LOWER(estado) = 'ocupado'`;

      if (ocupados.length) {
        const idEstadoOcupado = ocupados[0].idestado;
        await prisma.$executeRaw`
          UPDATE dbo.lugares_estacionamiento
          SET idestado = ${idEstadoOcupado}
          WHERE idlugar = ${reservacion.idlugar}`;
      }
    }
    // ==== FIN NUEVO ====

    res.json(reservacion);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   DELETE /api/reservaciones/:id
========================= */
reservacionesRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  try {
    const n =
      await prisma.$executeRaw`DELETE FROM dbo.reservaciones WHERE idreservacion=${id}`;
    if (n === 0) return res.status(404).json({ error: "no encontrado" });
    res.status(204).send();
  } catch (e: any) {
    res.status(409).json({ error: "No se puede eliminar: está en uso." });
  }
});

/* =========================
   PATCH /api/reservaciones/:id/cerrar
   - Reglas:
     * Debe estar CONFIRMADO y sin hora_salida
     * Setea estado = 'completado'
     * Setea hora_salida = SYSDATETIME()
========================= */
reservacionesRouter.patch("/:id/cerrar", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  try {
    const n = await prisma.$executeRawUnsafe(
      `
      UPDATE dbo.reservaciones
         SET estado_reservacion = 'completado',
             hora_salida        = SYSDATETIME()
       WHERE idreservacion = @p1
         AND LOWER(estado_reservacion) = 'confirmado'
         AND hora_salida IS NULL;
      `,
      id
    );

    if (n === 0) {
      return res.status(409).json({
        error:
          'No se pudo cerrar: debe estar "confirmado" y sin hora_salida.',
      });
    }

    const row = await prisma.$queryRaw<any[]>`
      SELECT r.*, e.nombre AS empresa_nombre, c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
             l.nombre AS lugar_nombre, t.tipo_vehiculo
      FROM dbo.reservaciones r
      JOIN dbo.empresas e ON e.idempresa = r.idempresa
      JOIN dbo.clientes c ON c.idcliente = r.idcliente
      JOIN dbo.lugares_estacionamiento l ON l.idlugar = r.idlugar
      JOIN dbo.tarifas t ON t.idtarifa = r.idtarifa
      WHERE r.idreservacion = ${id}`;
    res.json(row[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
