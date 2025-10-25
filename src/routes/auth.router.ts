// src/routes/auth.router.ts
import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../db/prisma";

export const authRouter = Router();

/**
 * POST /api/auth/login
 * Body: { correo: string, contrasena: string }
 * Respuestas:
 *  - 200 { user: {...}, roles: { isAdmin, isSoporte } }
 *  - 400 errores de validación
 *  - 401 credenciales inválidas
 */
authRouter.post("/login", async (req, res) => {
  const { correo, contrasena } = req.body || {};
  if (!correo || !contrasena) {
    return res.status(400).json({ error: "correo y contrasena son requeridos" });
  }

  // Traemos usuario con su hash
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT u.idusuario, u.idrol, u.idempresa, u.nombre, u.apellido, u.correo,
            u.NIT, u.telefono, u.codigo, u.fecha_creacion, u.fecha_actualizacion,
            u.contrasena
     FROM dbo.usuarios u
     WHERE u.correo = @p1`, correo
  );

  if (!rows.length) {
    return res.status(401).json({ error: "Credenciales inválidas" });
  }

  const u = rows[0] as any;
  const hash: string | null = u.contrasena;

  // Soportar cuentas antiguas sin hash (null o vacío) comparando plano
  let ok = false;
  if (hash && hash.startsWith("$2")) {
    ok = await bcrypt.compare(String(contrasena), hash);
  } else {
    ok = String(contrasena) === String(hash || "");
  }

  if (!ok) {
    return res.status(401).json({ error: "Credenciales inválidas" });
  }

  // Campos “seguros” (sin contrasena)
  const user = {
    idusuario: u.idusuario,
    idrol: u.idrol,
    idempresa: u.idempresa,
    nombre: u.nombre,
    apellido: u.apellido,
    correo: u.correo,
    NIT: u.NIT,
    telefono: u.telefono,
    codigo: u.codigo,
    fecha_creacion: u.fecha_creacion,
    fecha_actualizacion: u.fecha_actualizacion,
  };

  // Flags de rol (ajusta los IDs si en tu tabla cambian)
  const roles = {
    isAdmin: Number(u.idrol) === 2007,
    isSoporte: Number(u.idrol) === 2009,
  };

  // Si luego quieres JWT, aquí lo generarías y lo regresarías también
  res.json({ user, roles });
});
