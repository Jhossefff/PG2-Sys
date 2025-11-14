// src/routes/usuarios.router.ts
import { Router } from "express";
// Cambia a "bcryptjs" si instalaste esa variante:
// import bcrypt from "bcryptjs";
import bcrypt from "bcrypt";
import { prisma } from "../db/prisma";

export const usuariosRouter = Router();

/* Helpers */
const pickUsuarioSafe = `
  u.idusuario, u.idrol, u.idempresa, u.nombre, u.apellido, u.correo,
  u.NIT, u.telefono, u.codigo, u.fecha_creacion, u.fecha_actualizacion
`;

const has = (b: any, k: string) => Object.prototype.hasOwnProperty.call(b, k);

/** GET /api/usuarios?empresaId=&rolId=&search= */
usuariosRouter.get("/", async (req, res) => {
  const empresaId = typeof req.query.empresaId === "string" ? Number(req.query.empresaId) : null;
  const rolId     = typeof req.query.rolId     === "string" ? Number(req.query.rolId)     : null;
  const like      = typeof req.query.search    === "string" && req.query.search.trim() !== ""
    ? `%${req.query.search.trim()}%`
    : null;

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT ${pickUsuarioSafe}
     FROM dbo.usuarios u
     WHERE (@p1 IS NULL OR u.idempresa = @p1)
       AND (@p2 IS NULL OR u.idrol = @p2)
       AND (@p3 IS NULL OR u.correo LIKE @p3 OR u.nombre LIKE @p3 OR u.apellido LIKE @p3)
     ORDER BY u.idusuario DESC`,
    empresaId, rolId, like
  );
  res.json(rows);
});

/** GET /api/usuarios/:id (sin contraseña) */
usuariosRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const rows = await prisma.$queryRawUnsafe<any[]>(
    // 👇 aquí agregamos el alias u
    `SELECT ${pickUsuarioSafe} FROM dbo.usuarios u WHERE u.idusuario = @p1`,
    id
  );
  if (!rows.length) return res.status(404).json({ error: "no encontrado" });
  res.json(rows[0]);
});

/** POST /api/usuarios  (hashea la contraseña) */
usuariosRouter.post("/", async (req, res) => {
  const b = req.body as {
    idrol?: number;
    idempresa?: number | null;
    nombre?: string;
    apellido?: string;
    correo?: string;
    NIT?: string | null;
    telefono?: string | null;
    codigo?: string | null;
    contrasena?: string;
  };

  const required = ["idrol", "correo", "nombre", "apellido", "contrasena"] as const;
  for (const k of required) {
    if (!b?.[k]) return res.status(400).json({ error: `Falta ${k}` });
  }

  try {
    const hash = await bcrypt.hash(String(b.contrasena), 10);

    const out = await prisma.$queryRawUnsafe<{ idusuario: number }[]>(
      `INSERT INTO dbo.usuarios
        (idrol, idempresa, nombre, apellido, correo, NIT, telefono, codigo,
         fecha_creacion, fecha_actualizacion, contrasena)
       OUTPUT INSERTED.idusuario
       VALUES (@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, SYSDATETIME(), SYSDATETIME(), @p9)`,
      Number(b.idrol),
      b.idempresa ?? null,
      String(b.nombre),
      String(b.apellido),
      String(b.correo).trim(),
      b.NIT ?? null,
      b.telefono ?? null,
      b.codigo ?? null,
      hash
    );

    const id = out[0].idusuario;
    const row = await prisma.$queryRawUnsafe<any[]>(
      // 👇 aquí también usamos alias u
      `SELECT ${pickUsuarioSafe} FROM dbo.usuarios u WHERE u.idusuario = @p1`,
      id
    );
    res.status(201).json(row[0]);
  } catch (e: any) {
    const msg = String(e.message).toLowerCase();
    if (msg.includes("unique") || msg.includes("ux")) {
      return res.status(409).json({ error: "correo ya existe" });
    }
    res.status(500).json({ error: e.message });
  }
});

/** PUT /api/usuarios/:id  (parcial; si viene contrasena válida, se hashea) */
usuariosRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const b = req.body as {
    idrol?: number;
    idempresa?: number | null;
    nombre?: string | null;
    apellido?: string | null;
    correo?: string | null;
    NIT?: string | null;
    telefono?: string | null;
    codigo?: string | null;
    contrasena?: string | null;
  };

  // Solo actualizamos contraseña si viene string no vacío
  const shouldUpdatePwd =
    has(b, "contrasena") && typeof b.contrasena === "string" && b.contrasena.trim() !== "";
  const newHash = shouldUpdatePwd ? await bcrypt.hash(String(b.contrasena), 10) : null;

  // Para campos obligatorios, si no viene string válido -> ignorar cambio
  const should = (k: keyof typeof b) => has(b, k);
  const strOrIgnore = (v: any) =>
    typeof v === "string" && v.trim() !== "" ? String(v) : undefined;

  try {
    const sql = `
      UPDATE dbo.usuarios
      SET
        idrol               = CASE WHEN @p2  = 1 THEN @p3  ELSE idrol END,
        idempresa           = CASE WHEN @p4  = 1 THEN @p5  ELSE idempresa END,
        nombre              = CASE WHEN @p6  = 1 THEN @p7  ELSE nombre END,
        apellido            = CASE WHEN @p8  = 1 THEN @p9  ELSE apellido END,
        correo              = CASE WHEN @p10 = 1 THEN @p11 ELSE correo END,
        NIT                 = CASE WHEN @p12 = 1 THEN @p13 ELSE NIT END,
        telefono            = CASE WHEN @p14 = 1 THEN @p15 ELSE telefono END,
        codigo              = CASE WHEN @p16 = 1 THEN @p17 ELSE codigo END,
        contrasena          = CASE WHEN @p18 = 1 THEN @p19 ELSE contrasena END,
        fecha_actualizacion = SYSDATETIME()
      WHERE idusuario = @p1;
    `;

    const n = await prisma.$executeRawUnsafe(
      sql,
      id,
      // idrol (num)
      should("idrol") ? 1 : 0, should("idrol") ? Number(b.idrol) : null,
      // idempresa (num o null si tu esquema lo permite)
      should("idempresa") ? 1 : 0, should("idempresa") ? (b.idempresa ?? null) : null,
      // nombre (string requerido -> ignorar si vacío)
      should("nombre") ? 1 : 0, strOrIgnore(b.nombre),
      // apellido (string requerido -> ignorar si vacío)
      should("apellido") ? 1 : 0, strOrIgnore(b.apellido),
      // correo (string requerido -> ignorar si vacío)
      should("correo") ? 1 : 0, strOrIgnore(b.correo),
      // NIT (opcional)
      should("NIT") ? 1 : 0, has(b, "NIT") ? (b.NIT ?? null) : null,
      // telefono (opcional)
      should("telefono") ? 1 : 0, has(b, "telefono") ? (b.telefono ?? null) : null,
      // codigo (opcional)
      should("codigo") ? 1 : 0, has(b, "codigo") ? (b.codigo ?? null) : null,
      // contrasena (hash) — solo si shouldUpdatePwd
      shouldUpdatePwd ? 1 : 0, shouldUpdatePwd ? newHash : null
    );

    if (n === 0) return res.status(404).json({ error: "no encontrado" });

    const row = await prisma.$queryRawUnsafe<any[]>(
      // 👇 y aquí también alias u
      `SELECT ${pickUsuarioSafe} FROM dbo.usuarios u WHERE u.idusuario = @p1`,
      id
    );
    res.json(row[0]);
  } catch (e: any) {
    const msg = String(e.message).toLowerCase();
    if (msg.includes("unique") || msg.includes("ux")) {
      return res.status(409).json({ error: "correo ya existe" });
    }
    res.status(500).json({ error: e.message });
  }
});

/** DELETE /api/usuarios/:id */
usuariosRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  try {
    const n = await prisma.$executeRawUnsafe(
      `DELETE FROM dbo.usuarios WHERE idusuario=@p1`, id
    );
    if (n === 0) return res.status(404).json({ error: "no encontrado" });
    res.status(204).send();
  } catch {
    res.status(409).json({ error: "No se puede eliminar: está en uso (reservaciones/facturas)." });
  }
});
