import { Router } from "express";
import { prisma } from "../db/prisma";

export const usuariosRouter = Router();

/** GET /api/usuarios?empresaId=&rolId=&search= */
usuariosRouter.get("/", async (req, res) => {
  const empresaId = req.query.empresaId ? Number(req.query.empresaId) : null;
  const rolId = req.query.rolId ? Number(req.query.rolId) : null;
  const like = req.query.search ? `%${req.query.search}%` : null;

  const rows = await prisma.$queryRaw<any[]>`
    SELECT u.idusuario, u.idrol, u.idempresa, u.nombre, u.apellido, u.correo,
           u.NIT, u.telefono, u.codigo, u.fecha_creacion, u.fecha_actualizacion
    FROM dbo.usuarios u
    WHERE (${empresaId} IS NULL OR u.idempresa=${empresaId})
      AND (${rolId} IS NULL OR u.idrol=${rolId})
      AND (${like} IS NULL OR u.correo LIKE ${like} OR u.nombre LIKE ${like} OR u.apellido LIKE ${like})
    ORDER BY u.idusuario DESC`;
  res.json(rows);
});

usuariosRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await prisma.$queryRaw<any[]>`
    SELECT idusuario, idrol, idempresa, nombre, apellido, correo, NIT, telefono, codigo,
           fecha_creacion, fecha_actualizacion
    FROM dbo.usuarios WHERE idusuario=${id}`;
  if (!rows.length) return res.status(404).json({ error: "no encontrado" });
  res.json(rows[0]);
});

usuariosRouter.post("/", async (req, res) => {
  const b = req.body as any;
  const required = ["idrol", "correo", "nombre", "apellido", "contrasena"];
  for (const k of required) if (!b[k]) return res.status(400).json({ error: `Falta ${k}` });

  try {
    const out = await prisma.$queryRaw<{ idusuario: number }[]>`
      INSERT INTO dbo.usuarios(idrol, idempresa, nombre, apellido, correo, NIT, telefono, codigo,
                               fecha_creacion, fecha_actualizacion, contrasena)
      OUTPUT INSERTED.idusuario
      VALUES (${Number(b.idrol)}, ${b.idempresa ?? null}, ${b.nombre}, ${b.apellido},
              ${b.correo}, ${b.NIT ?? null}, ${b.telefono ?? null}, ${b.codigo ?? null},
              DEFAULT, DEFAULT, ${b.contrasena})`;
    const row = await prisma.$queryRaw<any[]>`
      SELECT idusuario, idrol, idempresa, nombre, apellido, correo, NIT, telefono, codigo,
             fecha_creacion, fecha_actualizacion
      FROM dbo.usuarios WHERE idusuario=${out[0].idusuario}`;
    res.status(201).json(row[0]);
  } catch (e: any) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "correo ya existe" });
    res.status(500).json({ error: e.message });
  }
});

usuariosRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body as any;

  const n = await prisma.$executeRaw`
    UPDATE dbo.usuarios SET
      idrol=${typeof b.idrol === "undefined" ? prisma.$queryRaw`idrol` : Number(b.idrol)},
      idempresa=${typeof b.idempresa === "undefined" ? prisma.$queryRaw`idempresa` : (b.idempresa ?? null)},
      nombre=${b.nombre ?? prisma.$queryRaw`nombre`},
      apellido=${b.apellido ?? prisma.$queryRaw`apellido`},
      correo=${b.correo ?? prisma.$queryRaw`correo`},
      NIT=${typeof b.NIT === "undefined" ? prisma.$queryRaw`NIT` : (b.NIT ?? null)},
      telefono=${typeof b.telefono === "undefined" ? prisma.$queryRaw`telefono` : (b.telefono ?? null)},
      codigo=${typeof b.codigo === "undefined" ? prisma.$queryRaw`codigo` : (b.codigo ?? null)},
      contrasena=${typeof b.contrasena === "undefined" ? prisma.$queryRaw`contrasena` : b.contrasena}
    WHERE idusuario=${id}`;
  if (n === 0) return res.status(404).json({ error: "no encontrado" });

  const row = await prisma.$queryRaw<any[]>`
    SELECT idusuario, idrol, idempresa, nombre, apellido, correo, NIT, telefono, codigo,
           fecha_creacion, fecha_actualizacion
    FROM dbo.usuarios WHERE idusuario=${id}`;
  res.json(row[0]);
});

usuariosRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const n = await prisma.$executeRaw`DELETE FROM dbo.usuarios WHERE idusuario=${id}`;
    if (n === 0) return res.status(404).json({ error: "no encontrado" });
    res.status(204).send();
  } catch {
    res.status(409).json({ error: "No se puede eliminar: está en uso (reservaciones/facturas)." });
  }
});
