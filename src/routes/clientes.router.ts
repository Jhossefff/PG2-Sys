// src/routes/clientes.router.ts
import { Router } from "express";
import { prisma } from "../db/prisma";

export const clientesRouter = Router();

/* helpers */
const numOrNull = (v: any) =>
  v === null || typeof v === "undefined" ? null : Number(v);

/* =========================================
   GET /api/clientes
========================================= */
clientesRouter.get("/", async (req, res) => {
  const texto =
    typeof req.query.texto === "string" && req.query.texto.trim() !== ""
      ? `%${req.query.texto.trim()}%`
      : null;

  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        c.idcliente,
        c.nombre,
        c.apellido,
        c.correo,
        c.telefono,
        c.codigo,
        c.fecha_creacion,
        c.latitud,
        c.longitud
      FROM dbo.clientes c
      WHERE (
        ${texto} IS NULL OR
        c.nombre LIKE ${texto} OR
        c.apellido LIKE ${texto} OR
        c.correo LIKE ${texto} OR
        c.codigo LIKE ${texto}
      )
      ORDER BY c.idcliente DESC`;
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================================
   GET /api/clientes/:id
========================================= */
clientesRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT c.*
      FROM dbo.clientes c
      WHERE c.idcliente = ${id}`;
    if (!rows.length) return res.status(404).json({ error: "no encontrado" });
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================================
   POST /api/clientes
========================================= */
clientesRouter.post("/", async (req, res) => {
  const b = req.body as {
    nombre?: string;
    apellido?: string;
    correo?: string;
    telefono?: string | null;
    codigo?: string | null;
    latitud?: number | null;
    longitud?: number | null;
  };

  if (!b?.nombre || !b?.apellido || !b?.correo) {
    return res
      .status(400)
      .json({ error: "nombre, apellido y correo son requeridos" });
  }

  try {
    const out = await prisma.$queryRaw<{ idcliente: number }[]>`
      INSERT INTO dbo.clientes
        (nombre, apellido, correo, telefono, codigo, fecha_creacion, latitud, longitud)
      OUTPUT INSERTED.idcliente
      VALUES (
        ${b.nombre},
        ${b.apellido},
        ${b.correo},
        ${b.telefono ?? null},
        ${b.codigo ?? null},
        SYSDATETIME(),
        ${numOrNull(b.latitud)},
        ${numOrNull(b.longitud)}
      )`;

    const id = out[0].idcliente;
    const cliente = await prisma.$queryRaw<any[]>`
      SELECT * FROM dbo.clientes WHERE idcliente = ${id}`;
    res.status(201).json(cliente[0]);
  } catch (e: any) {
    if (String(e.message).toLowerCase().includes("ux_clientes_correo_ci"))
      return res.status(409).json({ error: "correo ya existe" });
    res.status(500).json({ error: e.message });
  }
});






/* =========================================
   PUT /api/clientes/:id
   (corrige error de conversión de tipos)
========================================= */
clientesRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  const b = req.body as {
    nombre?: string;
    apellido?: string;
    correo?: string;
    telefono?: string | null;
    codigo?: string | null;
  };

  try {
    const sets: string[] = [];
    const params: any[] = [];

    const push = (sql: string, value: any) => {
      sets.push(sql.replace(/@pX/g, `@p${params.length + 1}`));
      params.push(value);
    };

    if (b.nombre) push("nombre = @pX", b.nombre);
    if (b.apellido) push("apellido = @pX", b.apellido);
    if (b.correo) push("correo = @pX", b.correo);
    if (b.telefono) push("telefono = @pX", b.telefono);
    if (b.codigo) push("codigo = @pX", b.codigo);

    if (sets.length === 0)
      return res.status(400).json({ error: "No hay campos para actualizar" });

    const sql = `
      UPDATE dbo.clientes
      SET ${sets.join(", ")}
      WHERE idcliente = @p${params.length + 1};
    `;
    params.push(id);

    const n = await prisma.$executeRawUnsafe(sql, ...params);
    if (n === 0) return res.status(404).json({ error: "no encontrado" });

    const row = await prisma.$queryRaw<any[]>`
      SELECT * FROM dbo.clientes WHERE idcliente = ${id}`;
    res.json(row[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================================
   DELETE /api/clientes/:id
   (corrige error de constraint FK)
========================================= */
clientesRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  try {
    const n = await prisma.$executeRaw`
      DELETE FROM dbo.clientes WHERE idcliente = ${id}`;
    if (n === 0) return res.status(404).json({ error: "no encontrado" });
    res.status(204).send();
  } catch (e: any) {
    if (String(e.message).includes("fk_reserva_cliente")) {
      return res.status(409).json({
        error: "No se puede eliminar: el cliente tiene reservaciones asociadas.",
      });
    }
    res.status(500).json({ error: e.message });
  }
});

