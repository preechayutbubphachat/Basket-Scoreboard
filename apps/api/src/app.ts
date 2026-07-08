import Fastify from "fastify";
import { healthResponseSchema } from "@basket-scoreboard/api-contracts";
import type { Pool } from "mysql2/promise";
import { registerCors } from "./cors.js";
import { createDatabasePool } from "./db.js";
import { createAuthHandlers } from "./auth/sessionAuth.js";
import { fastifyErrorHandler } from "./errors/apiErrors.js";
import { registerSpaFallback } from "./frontend/spaFallback.js";
import { registerAuthRoutes } from "./routes/authRoutes.js";
import { registerDeployDiagnosticsRoutes } from "./routes/deployDiagnosticsRoutes.js";
import { registerDisplayScreenRoutes } from "./routes/displayScreenRoutes.js";
import { registerMatchOfficialRoutes } from "./routes/matchOfficialRoutes.js";
import { registerMatchRoutes } from "./routes/matchRoutes.js";
import { registerOperatorRoutes } from "./routes/operatorRoutes.js";
import { registerRosterRoutes } from "./routes/rosterRoutes.js";
import { registerTournamentRoutes } from "./routes/tournamentRoutes.js";
import {
  noopProjectionRealtime,
  registerProjectionRealtime,
  type ProjectionRealtime
} from "./realtime/projectionRealtime.js";

export function buildApiApp(options: {
  pool?: Pool;
  frontendDistDir?: string | null;
  realtime?: { enabled?: boolean; service?: ProjectionRealtime };
} = {}) {
  const app = Fastify({
    logger: false
  });
  const pool = options.pool ?? createDatabasePool();
  const auth = createAuthHandlers(pool);
  const realtime =
    options.realtime?.service ??
    (options.realtime?.enabled || process.env.SOCKET_IO_ENABLED === "true"
      ? registerProjectionRealtime(app, pool)
      : noopProjectionRealtime);

  app.setErrorHandler(fastifyErrorHandler);
  registerCors(app);

  app.get("/api/v1/health", async () => {
    return healthResponseSchema.parse({
      status: "ok",
      service: "basket-scoreboard-api"
    });
  });

  registerDeployDiagnosticsRoutes(app);
  registerAuthRoutes(app, pool, auth);
  registerMatchRoutes(app, pool, auth, realtime);
  registerMatchOfficialRoutes(app, pool, auth);
  registerRosterRoutes(app, pool, auth);
  registerTournamentRoutes(app, pool, auth);
  registerOperatorRoutes(app, pool, auth);
  registerDisplayScreenRoutes(app, pool, auth);
  registerSpaFallback(
    app,
    options.frontendDistDir ? { frontendDistDir: options.frontendDistDir } : {}
  );

  if (!options.pool) {
    app.addHook("onClose", async () => {
      await pool.end();
    });
  }

  return app;
}
