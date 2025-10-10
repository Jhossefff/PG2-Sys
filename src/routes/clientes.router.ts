// src/routes/clientes.router.ts
import { Router } from "express";
import { prisma } from "../db/prisma";

export const clientesRouter = Router();

/* helpers */
const present = (b: any, k: string) => Object.prototype.hasOwnProperty.call(b, k);
const numOrNull = (v: any) =>
  v === null || typeof v === "undefined" ? null : Number(v);

/* =========================================
   GET /api/clientes?texto=&desde=&hasta=
   (texto busca en nombre/apellido/correo/codigo)
========================================= */
clientesRouter.get("/", async (req, res) => {
  const texto =
    typeof req.query.texto === "string" && req.query.texto.trim() !== ""
      ? `%${req.query.texto.trim()}%`
      : null;
  const desde = typeof req.query.desde === "string" ? req.query.desde : null;
  const hasta = typeof req.query.hasta === "string" ? req.query.hasta : null;

  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT c.idcliente, c.nombre, c.apellido, c.correo, c.telefono,
             c.contrasena, c.codigo, c.fecha_creacion, c.latitud, c.longitud
      FROM dbo.clientes c
      WHERE (
             ${texto} IS NULL OR
             c.nombre   LIKE ${texto} OR
             c.apellido LIKE ${texto} OR
             c.correo   LIKE ${texto} OR
             c.codigo   LIKE ${texto}
            )
        AND (${desde} IS NULL OR c.fecha_creacion >= TRY_CONVERT(datetime2, CAST(${desde} AS nvarchar(50)), 127))
        AND (${hasta} IS NULL OR c.fecha_creacion <= TRY_CONVERT(datetime2, CAST(${hasta} AS nvarchar(50)), 127))
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
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT c.idcliente, c.nombre, c.apellido, c.correo, c.telefono,
             c.contrasena, c.codigo, c.fecha_creacion, c.latitud, c.longitud
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
   Requeridos: nombre, apellido, correo
========================================= */
clientesRouter.post("/", async (req, res) => {
  const b = req.body as {
    nombre?: string;
    apellido?: string;
    correo?: string;
    telefono?: string | null;
    contrasena?: string | null;
    codigo?: string | null;
    fecha_creacion?: string | null; // ISO o null
    latitud?: number | null;
    longitud?: number | null;
  };

  if (!b?.nombre || !b?.apellido || !b?.correo) {
    return res.status(400).json({ error: "nombre, apellido y correo son requeridos" });
  }

  try {
    const out = await prisma.$queryRaw<{ idcliente: number }[]>`
      INSERT INTO dbo.clientes
        (nombre, apellido, correo, telefono, contrasena, codigo,
         fecha_creacion, latitud, longitud)
      OUTPUT INSERTED.idcliente
      VALUES (
        ${b.nombre},
        ${b.apellido},
        ${b.correo},
        ${b.telefono ?? null},
        ${b.contrasena ?? null},
        ${b.codigo ?? null},
        CASE
          WHEN ${b.fecha_creacion ?? null} IS NULL
            THEN SYSDATETIME()
          ELSE TRY_CONVERT(datetime2, CAST(${b.fecha_creacion ?? null} AS nvarchar(50)), 127)
        END,
        ${numOrNull(b.latitud)},
        ${numOrNull(b.longitud)}
      )`;

    const id = out[0].idcliente;
    const row = await prisma.$queryRaw<any[]>`
      SELECT c.idcliente, c.nombre, c.apellido, c.correo, c.telefono,
             c.contrasena, c.codigo, c.fecha_creacion, c.latitud, c.longitud
      FROM dbo.clientes c WHERE c.idcliente = ${id}`;
    res.status(201).json(row[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/clientes/:id  (actualización parcial, sin banderas ni choques de tipos)
clientesRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const b = req.body as {
    nombre?: string;
    apellido?: string;
    correo?: string;
    telefono?: string | null;
    contrasena?: string | null;
    codigo?: string | null;
    fecha_creacion?: string | null;
    latitud?: number | null;
    longitud?: number | null;
  };

  // Construimos el SET dinámicamente
  const sets: string[] = [];
  const params: any[] = [];

  const pushSet = (fragment: string, value: any) => {
    sets.push(fragment.replace(/@pX/g, `@p${params.length + 1}`));
    params.push(value);
  };

  if (Object.prototype.hasOwnProperty.call(b, "nombre"))
    pushSet("nombre = @pX", b.nombre ?? null);

  if (Object.prototype.hasOwnProperty.call(b, "apellido"))
    pushSet("apellido = @pX", b.apellido ?? null);

  if (Object.prototype.hasOwnProperty.call(b, "correo"))
    pushSet("correo = @pX", b.correo ?? null);

  if (Object.prototype.hasOwnProperty.call(b, "telefono"))
    pushSet("telefono = @pX", b.telefono === null ? null : String(b.telefono));

  if (Object.prototype.hasOwnProperty.call(b, "contrasena"))
    pushSet("contrasena = @pX", b.contrasena === null ? null : String(b.contrasena));

  if (Object.prototype.hasOwnProperty.call(b, "codigo"))
    pushSet("codigo = @pX", b.codigo === null ? null : String(b.codigo));

  if (Object.prototype.hasOwnProperty.call(b, "fecha_creacion")) {
    // Acepta null o ISO string. Evita “Explicit conversion from int to datetime2”
    pushSet(
      "fecha_creacion = CASE WHEN @pX IS NULL THEN NULL " +
        "ELSE TRY_CONVERT(datetime2, CAST(@pX AS nvarchar(50)), 127) END",
      b.fecha_creacion === null ? null : String(b.fecha_creacion)
    );
  }

  if (Object.prototype.hasOwnProperty.call(b, "latitud"))
    pushSet("latitud = @pX", b.latitud === null ? null : Number(b.latitud));

  if (Object.prototype.hasOwnProperty.call(b, "longitud"))
    pushSet("longitud = @pX", b.longitud === null ? null : Number(b.longitud));

  if (sets.length === 0) {
    return res.status(400).json({ error: "No se envió ningún campo para actualizar" });
  }

  try {
    const sql = `
      UPDATE dbo.clientes
      SET ${sets.join(", ")}
      WHERE idcliente = @p${params.length + 1};
    `;
    params.push(id);

    const n = await prisma.$executeRawUnsafe(sql, ...params);
    if (n === 0) return res.status(404).json({ error: "no encontrado" });

    const row = await prisma.$queryRaw<any[]>`
      SELECT c.idcliente, c.nombre, c.apellido, c.correo, c.telefono,
             c.contrasena, c.codigo, c.fecha_creacion, c.latitud, c.longitud
      FROM dbo.clientes c
      WHERE c.idcliente = ${id}`;
    res.json(row[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


/* =========================================
   DELETE /api/clientes/:id
========================================= */
clientesRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });
  try {
    const n = await prisma.$executeRaw`
      DELETE FROM dbo.clientes WHERE idcliente = ${id}`;
    if (n === 0) return res.status(404).json({ error: "no encontrado" });
    res.status(204).send();
  } catch {
    res.status(409).json({ error: "No se puede eliminar: está referenciado." });
  }
});
