import { Router } from "express";
import { prisma } from "../db/prisma";
export const clientesRouter = Router();

/** GET /api/clientes?search=&page=&pageSize= */
clientesRouter.get("/", async (req, res) => {
  const { search, page="1", pageSize="20" } = req.query as Record<string,string>;
  const p = Math.max(1, Number(page) || 1);
  const s = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const skip = (p - 1) * s;
  const like = search ? `%${search}%` : null;

  const rows = like
    ? await prisma.$queryRaw<any[]>`
        SELECT idcliente, nombre, apellido, correo, telefono, codigo, fecha_creacion, latitud, longitud
        FROM dbo.clientes
        WHERE nombre LIKE ${like} OR apellido LIKE ${like} OR correo LIKE ${like}
        ORDER BY idcliente OFFSET ${skip} ROWS FETCH NEXT ${s} ROWS ONLY`
    : await prisma.$queryRaw<any[]>`
        SELECT idcliente, nombre, apellido, correo, telefono, codigo, fecha_creacion, latitud, longitud
        FROM dbo.clientes
        ORDER BY idcliente OFFSET ${skip} ROWS FETCH NEXT ${s} ROWS ONLY`;
  res.json(rows);
});

/** GET /api/clientes/:id */
clientesRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error:"id inválido" });
  const rows = await prisma.$queryRaw<any[]>`
    SELECT idcliente, nombre, apellido, correo, telefono, codigo, fecha_creacion, latitud, longitud
    FROM dbo.clientes WHERE idcliente=${id}`;
  if (rows.length === 0) return res.status(404).json({ error:"no encontrado" });
  res.json(rows[0]);
});

/** POST /api/clientes */
clientesRouter.post("/", async (req, res) => {
  const { nombre, apellido, correo, telefono, contrasena, codigo, latitud, longitud } = req.body as any;
  if (!nombre || !apellido || !correo || !contrasena)
    return res.status(400).json({ error: "nombre, apellido, correo y contrasena son requeridos" });
  try {
    const out = await prisma.$queryRaw<{ idcliente:number }[]>`
      INSERT INTO dbo.clientes(nombre, apellido, correo, telefono, contrasena, codigo, latitud, longitud)
      OUTPUT INSERTED.idcliente
      VALUES (${nombre}, ${apellido}, ${correo}, ${telefono ?? null}, ${contrasena}, ${codigo ?? null},
              ${latitud ?? null}, ${longitud ?? null})`;
    const row = await prisma.$queryRaw<any[]>`
      SELECT idcliente, nombre, apellido, correo, telefono, codigo, fecha_creacion, latitud, longitud
      FROM dbo.clientes WHERE idcliente=${out[0].idcliente}`;
    res.status(201).json(row[0]);
  } catch (e:any) {
    if (String(e.message).includes("UNIQUE") || String(e.message).includes("UQ"))
      return res.status(409).json({ error: "correo ya existe" });
    res.status(500).json({ error: e.message });
  }
});

/** PUT /api/clientes/:id  – merge en Node y update con valores finales */
clientesRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  // saneadores
  const cleanStr = (v: unknown) => {
    if (typeof v !== "string") return undefined;          // undefined => no cambia
    const t = v.trim();
    if (!t || t === "{}") return undefined;
    return t;
  };
  const cleanNum = (v: unknown) => {
    if (v === null || typeof v === "undefined" || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  try {
    // 1) leer actual
    const cur = await prisma.$queryRaw<any[]>`
      SELECT idcliente, nombre, apellido, correo, telefono, contrasena, codigo, latitud, longitud
      FROM dbo.clientes WHERE idcliente=${id}`;
    if (cur.length === 0) return res.status(404).json({ error: "no encontrado" });
    const c = cur[0];

    // 2) merge en Node
    const body = req.body as any;
    const next = {
      nombre:     cleanStr(body?.nombre)     ?? c.nombre,
      apellido:   cleanStr(body?.apellido)   ?? c.apellido,
      correo:     cleanStr(body?.correo)     ?? c.correo,
      telefono:   cleanStr(body?.telefono)   ?? c.telefono,
      contrasena: cleanStr(body?.contrasena) ?? c.contrasena, // sigue siendo NOT NULL
      codigo:     cleanStr(body?.codigo)     ?? c.codigo,
      latitud:    cleanNum(body?.latitud)    ?? c.latitud,
      longitud:   cleanNum(body?.longitud)   ?? c.longitud,
    };

    // 2.1) si cambia el correo, validar unique contra otros
    if (next.correo !== c.correo) {
      const dup = await prisma.$queryRaw<{idcliente:number}[]>`
        SELECT idcliente FROM dbo.clientes WHERE correo=${next.correo} AND idcliente<>${id}`;
      if (dup.length) return res.status(409).json({ error: "correo ya existe" });
    }

    // 3) update con valores finales (sin COALESCE)
    await prisma.$executeRaw`
      UPDATE dbo.clientes SET
        nombre=${next.nombre},
        apellido=${next.apellido},
        correo=${next.correo},
        telefono=${next.telefono},
        contrasena=${next.contrasena},
        codigo=${next.codigo},
        latitud=${next.latitud},
        longitud=${next.longitud}
      WHERE idcliente=${id}`;

    const out = await prisma.$queryRaw<any[]>`
      SELECT idcliente, nombre, apellido, correo, telefono, codigo, fecha_creacion, latitud, longitud
      FROM dbo.clientes WHERE idcliente=${id}`;
    res.json(out[0]);
  } catch (e: any) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** DELETE /api/clientes/:id */
clientesRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error:"id inválido" });
  try {
    const n = await prisma.$executeRaw`
      DELETE FROM dbo.clientes WHERE idcliente=${id}`;
    if (n === 0) return res.status(404).json({ error:"no encontrado" });
    res.status(204).send();
  } catch {
    res.status(409).json({ error: "No se puede eliminar: tiene reservas/facturas asociadas." });
  }
});
