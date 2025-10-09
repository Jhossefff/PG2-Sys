import { Router } from "express";
import { prisma } from "../db/prisma";

export const lugaresRouter = Router();

/** GET /api/lugares?empresaId= */
lugaresRouter.get("/", async (req, res) => {
  const empresaId =
    typeof req.query.empresaId === "string" ? Number(req.query.empresaId) : null;

  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT l.idlugar, l.idempresa, e.nombre AS empresa_nombre, e.codigo AS empresa_codigo,
              l.idestado, el.estado AS estado_nombre,
              l.nombre, l.descripcion
       FROM dbo.lugares_estacionamiento l
       JOIN dbo.empresas e ON e.idempresa = l.idempresa
       LEFT JOIN dbo.estados_lugares el ON el.idestado = l.idestado
       WHERE (@p1 IS NULL OR l.idempresa = @p1)
       ORDER BY l.idlugar DESC`,
      empresaId
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/lugares/:id */
lugaresRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const rows = await prisma.$queryRaw<any[]>`
    SELECT l.idlugar, l.idempresa, e.nombre AS empresa_nombre, e.codigo AS empresa_codigo,
           l.idestado, el.estado AS estado_nombre,
           l.nombre, l.descripcion
    FROM dbo.lugares_estacionamiento l
    JOIN dbo.empresas e ON e.idempresa = l.idempresa
    LEFT JOIN dbo.estados_lugares el ON el.idestado = l.idestado
    WHERE l.idlugar = ${id}`;
  if (!rows.length) return res.status(404).json({ error: "no encontrado" });
  res.json(rows[0]);
});

/** POST /api/lugares */
lugaresRouter.post("/", async (req, res) => {
  const b = req.body as {
    idempresa?: number;
    idestado?: number;
    nombre?: string;
    descripcion?: string | null;
  };
  if (![b?.idempresa, b?.idestado].every(v => Number.isInteger(Number(v))) || !b?.nombre) {
    return res.status(400).json({ error: "idempresa, idestado y nombre son requeridos" });
  }

  try {
    const out = await prisma.$queryRawUnsafe<{ idlugar:number }[]>(
      `INSERT INTO dbo.lugares_estacionamiento (idempresa, idestado, nombre, descripcion)
       OUTPUT INSERTED.idlugar
       VALUES (@p1, @p2, @p3, @p4)`,
      Number(b.idempresa), Number(b.idestado), b.nombre, b.descripcion ?? null
    );

    const row = await prisma.$queryRaw<any[]>`
      SELECT l.idlugar, l.idempresa, e.nombre AS empresa_nombre, e.codigo AS empresa_codigo,
             l.idestado, el.estado AS estado_nombre,
             l.nombre, l.descripcion
      FROM dbo.lugares_estacionamiento l
      JOIN dbo.empresas e ON e.idempresa = l.idempresa
      LEFT JOIN dbo.estados_lugares el ON el.idestado = l.idestado
      WHERE l.idlugar = ${out[0].idlugar}`;
    res.status(201).json(row[0]);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

/** PUT /api/lugares/:id (parcial, con banderas) */
lugaresRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

  const b = req.body as {
    idempresa?: number;
    idestado?: number;
    nombre?: string;
    descripcion?: string | null;
  };
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);

  try {
    const sql = `
      UPDATE dbo.lugares_estacionamiento
      SET
        idempresa   = CASE WHEN @p2 = 1 THEN @p3 ELSE idempresa   END,
        idestado    = CASE WHEN @p4 = 1 THEN @p5 ELSE idestado    END,
        nombre      = CASE WHEN @p6 = 1 THEN @p7 ELSE nombre      END,
        descripcion = CASE WHEN @p8 = 1 THEN @p9 ELSE descripcion END
      WHERE idlugar = @p1;
    `;

    const n = await prisma.$executeRawUnsafe(
      sql,
      // @p1
      id,
      // idempresa: flag + valor
      has("idempresa") ? 1 : 0, has("idempresa") ? Number(b.idempresa) : null,
      // idestado
      has("idestado") ? 1 : 0, has("idestado") ? Number(b.idestado) : null,
      // nombre
      has("nombre") ? 1 : 0, has("nombre") ? String(b.nombre) : null,
      // descripcion
      has("descripcion") ? 1 : 0, has("descripcion") ? (b.descripcion ?? null) : null
    );

    if (n === 0) return res.status(404).json({ error: "no encontrado" });

    const row = await prisma.$queryRaw<any[]>`
      SELECT l.idlugar, l.idempresa, e.nombre AS empresa_nombre, e.codigo AS empresa_codigo,
             l.idestado, el.estado AS estado_nombre,
             l.nombre, l.descripcion
      FROM dbo.lugares_estacionamiento l
      JOIN dbo.empresas e ON e.idempresa = l.idempresa
      LEFT JOIN dbo.estados_lugares el ON el.idestado = l.idestado
      WHERE l.idlugar = ${id}`;
    res.json(row[0]);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

/** DELETE /api/lugares/:id */
lugaresRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });
  try {
    const n = await prisma.$executeRaw`DELETE FROM dbo.lugares_estacionamiento WHERE idlugar=${id}`;
    if (n === 0) return res.status(404).json({ error: "no encontrado" });
    res.status(204).send();
  } catch {
    res.status(409).json({ error: "No se puede eliminar: está en uso por reservaciones." });
  }
});
