import express from "express";
import cors from "cors";
import { prisma } from "./db/prisma";

import { estadosLugaresRouter } from "./routes/estados-lugares.router";
import { estadosPagoRouter } from "./routes/estados-pago.router";
import { formasPagoRouter } from "./routes/formas-pago.router";
import { empresasRouter } from "./routes/empresas.router";
import { clientesRouter } from "./routes/clientes.router";
import { permisosRouter } from "./routes/permisos.router";
import { rolesRouter } from "./routes/roles.router";

import { lugaresRouter } from "./routes/lugares.router";
import { tarifasRouter } from "./routes/tarifas.router";
import { reservacionesRouter } from "./routes/reservaciones.router";
import { facturasRouter } from "./routes/facturas.router";
import { ingresosRouter } from "./routes/ingresos.router";
import { transaccionesRouter } from "./routes/transacciones.router";
import { usuariosRouter } from "./routes/usuarios.router";
import { usuariosClientesRouter } from "./routes/usuarios-clientes.router";
import { rolesPermisosRouter } from "./routes/roles-permisos.router";




export const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "backend", ts: new Date().toISOString() })
);

app.get("/db/ping-prisma", async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ ok: true, via: "prisma" }); }
  catch (e:any) { res.status(500).json({ ok:false, via:"prisma", error:e.message }); }
});

// Routers
app.use("/api/estados-lugares", estadosLugaresRouter);
app.use("/api/estados-pago", estadosPagoRouter);
app.use("/api/formas-pago", formasPagoRouter);
app.use("/api/empresas", empresasRouter);
app.use("/api/clientes", clientesRouter);
app.use("/api/permisos", permisosRouter);
app.use("/api/roles", rolesRouter);




app.use("/api/lugares", lugaresRouter);
app.use("/api/tarifas", tarifasRouter);
app.use("/api/reservaciones", reservacionesRouter);
app.use("/api/facturas", facturasRouter);
app.use("/api/ingresos", ingresosRouter);
app.use("/api/transacciones", transaccionesRouter);
app.use("/api/usuarios", usuariosRouter);
app.use("/api/usuarios-clientes", usuariosClientesRouter);
app.use("/api/roles-permisos", rolesPermisosRouter);



