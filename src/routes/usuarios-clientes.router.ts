import { Router } from "express";
import { prisma } from "../db/prisma";

export const usuariosClientesRouter = Router();

/** GET /api/usuarios-clientes?clienteId= */
usuariosClientesRouter.get("/", async (req, res) => {
  const clienteId = req.query.clienteId ? Number(req.query.clienteId) : null;
  const rows = await prisma.$queryRaw<any[]>`
    SELECT * FROM dbo.usuarios_clientes
    WHERE (${clienteId} IS NULL OR idcliente=${clienteId})
    ORDER BY idusuario DESC`;
  res.json(rows);
});

usuariosClientesRouter.post("/", async (req, res) => {
  const b = req.body as any;
  if (!b.idcliente || !b.usuario || !b.correo || !b.contrasena)
    return res.status(400).json({ error: "idcliente, usuario, correo y contrasena requeridos" });

  try {
    const out = await prisma.$queryRaw<{ idusuario: number }[]>`
      INSERT INTO dbo.usuarios_clientes(idcliente, usuario, correo, contrasena, rol, estado, fecha_creacion)
      OUTPUT INSERTED.idusuario
      VALUES (${Number(b.idcliente)}, ${b.usuario}, ${b.correo}, ${b.contrasena},
              ${b.rol ?? null}, ${typeof b.estado === "undefined" ? 1 : (b.estado ? 1 : 0)}, DEFAULT)`;
    const row = await prisma.$queryRaw<any[]>`
      SELECT * FROM dbo.usuarios_clientes WHERE idusuario=${out[0].idusuario}`;
    res.status(201).json(row[0]);
  } catch (e: any) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "correo ya existe" });
    res.status(500).json({ error: e.message });
  }
});

usuariosClientesRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body as any;

  const n = await prisma.$executeRaw`
    UPDATE dbo.usuarios_clientes SET
      idcliente=${typeof b.idcliente === "undefined" ? prisma.$queryRaw`idcliente` : Number(b.idcliente)},
      usuario=${b.usuario ?? prisma.$queryRaw`usuario`},
      correo=${b.correo ?? prisma.$queryRaw`correo`},
      contrasena=${b.contrasena ?? prisma.$queryRaw`contrasena`},
      rol=${typeof b.rol === "undefined" ? prisma.$queryRaw`rol` : b.rol},
      estado=${typeof b.estado === "undefined" ? prisma.$queryRaw`estado` : (b.estado ? 1 : 0)}
    WHERE idusuario=${id}`;
  if (n === 0) return res.status(404).json({ error: "no encontrado" });

  const row = await prisma.$queryRaw<any[]>`
    SELECT * FROM dbo.usuarios_clientes WHERE idusuario=${id}`;
  res.json(row[0]);
});

usuariosClientesRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const n = await prisma.$executeRaw`DELETE FROM dbo.usuarios_clientes WHERE idusuario=${id}`;
  if (n === 0) return res.status(404).json({ error: "no encontrado" });
  res.status(204).send();
});
