import Fastify from "fastify";
import { healthResponseSchema } from "@basket-scoreboard/api-contracts";
import type { Pool } from "mysql2/promise";
import { createDatabasePool } from "./db.js";
import { createAuthHandlers } from "./auth/sessionAuth.js";
import { fastifyErrorHandler } from "./errors/apiErrors.js";
import { registerAuthRoutes } from "./routes/authRoutes.js";
import { registerMatchOfficialRoutes } from "./routes/matchOfficialRoutes.js";
import { registerMatchRoutes } from "./routes/matchRoutes.js";
import { registerOperatorRoutes } from "./routes/operatorRoutes.js";

export function buildApiApp(options: { pool?: Pool } = {}) {
  const app = Fastify({
    logger: false
  });
  const pool = options.pool ?? createDatabasePool();
  const auth = createAuthHandlers(pool);

  app.setErrorHandler(fastifyErrorHandler);

  app.get("/api/v1/health", async () => {
    return healthResponseSchema.parse({
      status: "ok",
      service: "basket-scoreboard-api"
    });
  });

  registerAuthRoutes(app, pool, auth);
  registerMatchRoutes(app, pool, auth);
  registerMatchOfficialRoutes(app, pool, auth);
  registerOperatorRoutes(app, pool, auth);

  if (!options.pool) {
    app.addHook("onClose", async () => {
      await pool.end();
    });
  }

  return app;
}
