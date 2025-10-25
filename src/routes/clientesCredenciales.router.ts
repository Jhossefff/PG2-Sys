// src/routes/clientesCredenciales.router.ts
import { Router } from "express";
import { prisma } from "../db/prisma";

export const clientesCredencialesRouter = Router();

/* =========================================
   GET /api/clientes-credenciales
========================================= */
clientesCredencialesRouter.get("/", async (req, res) => {
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT cc.idcredencial, cc.idcliente, c.correo,
             cc.password_algo, cc.intentos_fallidos,
             cc.bloqueo_hasta, cc.ultimo_login,
             cc.creado_en, cc.actualizado_en
      FROM dbo.clientes_credenciales cc
      JOIN dbo.clientes c ON c.idcliente = cc.idcliente
      ORDER BY cc.idcredencial DESC`;
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================================
   GET /api/clientes-credenciales/:id
========================================= */
clientesCredencialesRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT * FROM dbo.clientes_credenciales WHERE idcredencial = ${id}`;
    if (!rows.length) return res.status(404).json({ error: "no encontrado" });
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================================
   POST /api/clientes-credenciales
========================================= */
clientesCredencialesRouter.post("/", async (req, res) => {
  const b = req.body as { idcliente?: number; password?: string; algo?: string };
  if (!b.idcliente || !b.password)
    return res
      .status(400)
      .json({ error: "idcliente y password son requeridos" });

  try {
    const out = await prisma.$queryRaw<{ idcredencial: number }[]>`
      INSERT INTO dbo.clientes_credenciales (idcliente, password_hash_text, password_algo)
      OUTPUT INSERTED.idcredencial
      VALUES (${b.idcliente}, ${b.password}, ${b.algo ?? "legacy"})`;

    const id = out[0].idcredencial;
    const credencial = await prisma.$queryRaw<any[]>`
      SELECT * FROM dbo.clientes_credenciales WHERE idcredencial = ${id}`;
    res.status(201).json(credencial[0]);
  } catch (e: any) {
    if (String(e.message).includes("UX_credenciales_idcliente"))
      return res
        .status(409)
        .json({ error: "ya existen credenciales para este cliente" });
    res.status(500).json({ error: e.message });
  }
});

/* =========================================
   PUT /api/clientes-credenciales/:id
   (actualiza campos de forma segura y flexible)
========================================= */
clientesCredencialesRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id inválido" });
  }

  const b = req.body as {
    password?: string | null;
    algo?: string | null;
    intentos_fallidos?: number | null;
    bloqueo_hasta?: string | null; // ISO o null
    ultimo_login?: string | null;  // ISO o null
  };

  try {
    const sets: string[] = [];
    const params: any[] = [];

    const push = (fragment: string, value: any) => {
      sets.push(fragment.replace(/@pX/g, `@p${params.length + 1}`));
      params.push(value);
    };

    // Solo modifica los campos que vengan explícitos en el body
    if (Object.prototype.hasOwnProperty.call(b, "password")) {
      // Si envían "", no lo actualizamos (evitar dejar contraseñas vacías)
      if (b.password && b.password.trim() !== "") {
        push("password_hash_text = @pX", b.password);
      }
    }

    if (Object.prototype.hasOwnProperty.call(b, "algo")) {
      // Si viene null, no lo tocamos; si viene string, lo seteamos
      if (typeof b.algo === "string" && b.algo.trim() !== "") {
        push("password_algo = @pX", b.algo);
      }
    }

    if (Object.prototype.hasOwnProperty.call(b, "intentos_fallidos")) {
      if (typeof b.intentos_fallidos === "number") {
        push("intentos_fallidos = @pX", Math.max(0, Math.min(255, b.intentos_fallidos)));
      }
    }

    if (Object.prototype.hasOwnProperty.call(b, "bloqueo_hasta")) {
      // Acepta null o ISO string
      push(
        "bloqueo_hasta = CASE WHEN @pX IS NULL THEN NULL ELSE TRY_CONVERT(datetime2, CAST(@pX AS nvarchar(50)), 127) END",
        b.bloqueo_hasta === null ? null : String(b.bloqueo_hasta)
      );
    }

    if (Object.prototype.hasOwnProperty.call(b, "ultimo_login")) {
      // Acepta null o ISO string
      push(
        "ultimo_login = CASE WHEN @pX IS NULL THEN NULL ELSE TRY_CONVERT(datetime2, CAST(@pX AS nvarchar(50)), 127) END",
        b.ultimo_login === null ? null : String(b.ultimo_login)
      );
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    // Siempre actualizamos la marca de tiempo
    sets.push("actualizado_en = SYSUTCDATETIME()");

    const sql = `
      UPDATE dbo.clientes_credenciales
      SET ${sets.join(", ")}
      WHERE idcredencial = @p${params.length + 1};
    `;
    params.push(id);

    const n = await prisma.$executeRawUnsafe(sql, ...params);
    if (n === 0) {
      return res.status(404).json({ error: "no encontrado" });
    }

    const row = await prisma.$queryRaw<any[]>`
      SELECT cc.idcredencial, cc.idcliente, c.correo,
             cc.password_algo, cc.intentos_fallidos,
             cc.bloqueo_hasta, cc.ultimo_login,
             cc.creado_en, cc.actualizado_en
      FROM dbo.clientes_credenciales cc
      JOIN dbo.clientes c ON c.idcliente = cc.idcliente
      WHERE cc.idcredencial = ${id}`;
    res.json(row[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================================
   DELETE /api/clientes-credenciales/:id
========================================= */
clientesCredencialesRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "id inválido" });

  try {
    const n = await prisma.$executeRaw`
      DELETE FROM dbo.clientes_credenciales WHERE idcredencial = ${id}`;
    if (n === 0) return res.status(404).json({ error: "no encontrado" });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
