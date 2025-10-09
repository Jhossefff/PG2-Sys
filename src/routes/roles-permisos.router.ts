import { Router } from "express";
import { prisma } from "../db/prisma";

export const rolesPermisosRouter = Router();

/** GET /api/roles-permisos?rolId= */
rolesPermisosRouter.get("/", async (req, res) => {
  const rolId = req.query.rolId ? Number(req.query.rolId) : null;
  const rows = await prisma.$queryRaw<any[]>`
    SELECT rp.idrolpermiso, rp.idrol, r.nombre AS rol_nombre,
           rp.idpermiso, p.nombre AS permiso_nombre
    FROM dbo.roles_permisos rp
    JOIN dbo.roles r     ON r.idrol = rp.idrol
    JOIN dbo.permisos p  ON p.idpermiso = rp.idpermiso
    WHERE (${rolId} IS NULL OR rp.idrol=${rolId})
    ORDER BY rp.idrolpermiso DESC`;
  res.json(rows);
});

/** POST { idrol, idpermiso } */
rolesPermisosRouter.post("/", async (req, res) => {
  const { idrol, idpermiso } = req.body as any;
  if (!idrol || !idpermiso) return res.status(400).json({ error: "idrol e idpermiso requeridos" });

  const out = await prisma.$queryRaw<{ idrolpermiso: number }[]>`
    INSERT INTO dbo.roles_permisos(idrol, idpermiso)
    OUTPUT INSERTED.idrolpermiso
    VALUES (${Number(idrol)}, ${Number(idpermiso)})`;
  const row = await prisma.$queryRaw<any[]>`
    SELECT * FROM dbo.roles_permisos WHERE idrolpermiso=${out[0].idrolpermiso}`;
  res.status(201).json(row[0]);
});

/** DELETE asignación */
rolesPermisosRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const n = await prisma.$executeRaw`DELETE FROM dbo.roles_permisos WHERE idrolpermiso=${id}`;
  if (n === 0) return res.status(404).json({ error: "no encontrado" });
  res.status(204).send();
});
