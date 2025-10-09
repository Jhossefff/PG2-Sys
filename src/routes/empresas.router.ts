import { Router } from "express";
import { prisma } from "../db/prisma";
export const empresasRouter = Router();

/** GET /api/empresas?search=...&page=1&pageSize=20 */
empresasRouter.get("/", async (req, res) => {
  const { search, page = "1", pageSize = "20" } = req.query as Record<string, string>;
  const p = Math.max(1, Number(page) || 1);
  const s = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const skip = (p - 1) * s;
  const like = search ? `%${search}%` : null;

  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        idempresa, codigo, nombre, NIT, telefono, correo, direccion,
        latitud, longitud, urlmapa, direccion_formateada,
        fecha_creacion, fecha_actualizacion
      FROM dbo.empresas
      WHERE (${like} IS NULL
             OR codigo LIKE ${like}
             OR nombre LIKE ${like}
             OR NIT    LIKE ${like})
      ORDER BY idempresa
      OFFSET ${skip} ROWS FETCH NEXT ${s} ROWS ONLY;
    `;
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/empresas/:id */
empresasRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });
  const rows = await prisma.$queryRaw<any[]>`
    SELECT * FROM dbo.empresas WHERE idempresa=${id}`;
  if (rows.length === 0) return res.status(404).json({ error: "no encontrado" });
  res.json(rows[0]);
});

/** POST /api/empresas  (valida UNIQUE codigo) */
empresasRouter.post("/", async (req, res) => {
  const {
    codigo, nombre, NIT, telefono, correo, direccion,
    latitud, longitud, urlmapa, direccion_formateada
  } = req.body as any;

  if (!codigo || !nombre || !NIT)
    return res.status(400).json({ error: "codigo, nombre y NIT son requeridos" });

  try {
    const out = await prisma.$queryRaw<{ idempresa: number }[]>`
      INSERT INTO dbo.empresas
      (codigo, nombre, NIT, telefono, correo, direccion, latitud, longitud, urlmapa, direccion_formateada)
      OUTPUT INSERTED.idempresa
      VALUES (${codigo}, ${nombre}, ${NIT}, ${telefono ?? null}, ${correo ?? null},
              ${direccion ?? null}, ${latitud ?? null}, ${longitud ?? null},
              ${urlmapa ?? null}, ${direccion_formateada ?? null})`;
    const id = out[0].idempresa;
    const row = await prisma.$queryRaw<any[]>`
      SELECT * FROM dbo.empresas WHERE idempresa=${id}`;
    res.status(201).json(row[0]);
  } catch (e: any) {
    const msg = String(e.message || "");
    if (msg.includes("UNIQUE") || msg.includes("UQ") || msg.includes("Violation of UNIQUE"))
      return res.status(409).json({ error: "codigo ya existe" });
    res.status(500).json({ error: e.message });
  }
});

/** PUT /api/empresas/:id  (trigger actualiza fecha_actualizacion) */
empresasRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  // Campos que podrías actualizar
  const {
    codigo, nombre, NIT, telefono, correo, direccion,
    latitud, longitud, urlmapa, direccion_formateada
  } = req.body as Record<string, any>;

  // Construir SET dinámico solo con lo enviado
  const sets: string[] = [];
  const args: any[] = [];

  const add = (sqlFrag: string, val: any) => { sets.push(sqlFrag); args.push(val); };

  if (codigo !== undefined)               add("codigo = @p" + (args.length + 1), codigo);
  if (nombre !== undefined)               add("nombre = @p" + (args.length + 1), nombre);
  if (NIT !== undefined)                  add("NIT = @p" + (args.length + 1), NIT);
  if (telefono !== undefined)             add("telefono = @p" + (args.length + 1), telefono);
  if (correo !== undefined)               add("correo = @p" + (args.length + 1), correo);
  if (direccion !== undefined)            add("direccion = @p" + (args.length + 1), direccion);
  if (latitud !== undefined)              add("latitud = @p" + (args.length + 1), latitud);
  if (longitud !== undefined)             add("longitud = @p" + (args.length + 1), longitud);
  if (urlmapa !== undefined)              add("urlmapa = @p" + (args.length + 1), urlmapa);
  if (direccion_formateada !== undefined) add("direccion_formateada = @p" + (args.length + 1), direccion_formateada);

  if (sets.length === 0) {
    return res.status(400).json({ error: "No se envió ningún campo para actualizar" });
  }

  try {
    // UPDATE dinámico y seguro (parametrizado)
    const sql = `
      UPDATE dbo.empresas
      SET ${sets.join(", ")}
      WHERE idempresa = @p${args.length + 1};
    `;
    const n = await prisma.$executeRawUnsafe(sql, ...args, id);
    if (n === 0) return res.status(404).json({ error: "no encontrado" });

    const row = await prisma.$queryRaw<any[]>`
      SELECT * FROM dbo.empresas WHERE idempresa=${id}`;
    res.json(row[0]);
  } catch (e: any) {
    const msg = String(e.message || "");
    if (msg.includes("UNIQUE") || msg.includes("UQ") || msg.includes("Violation of UNIQUE")) {
      return res.status(409).json({ error: "codigo ya existe" });
    }
    res.status(500).json({ error: e.message });
  }
});


/** DELETE /api/empresas/:id */
empresasRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });
  try {
    const n = await prisma.$executeRaw`
      DELETE FROM dbo.empresas WHERE idempresa=${id}`;
    if (n === 0) return res.status(404).json({ error: "no encontrado" });
    res.status(204).send();
  } catch {
    res.status(409).json({
      error: "No se puede eliminar: hay registros relacionados (tarifas, usuarios, lugares, reservaciones...)."
    });
  }
});
