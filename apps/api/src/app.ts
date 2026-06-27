import Fastify from "fastify";
import { healthResponseSchema } from "@basket-scoreboard/api-contracts";
import type { Pool } from "mysql2/promise";
import { createDatabasePool } from "./db.js";
import { getCurrentUser, requireAuth } from "./auth/placeholderAuth.js";
import { fastifyErrorHandler } from "./errors/apiErrors.js";
import { registerMatchRoutes } from "./routes/matchRoutes.js";

export function buildApiApp(options: { pool?: Pool } = {}) {
  const app = Fastify({
    logger: false
  });
  const pool = options.pool ?? createDatabasePool();

  app.setErrorHandler(fastifyErrorHandler);

  app.get("/api/v1/health", async () => {
    return healthResponseSchema.parse({
      status: "ok",
      service: "basket-scoreboard-api"
    });
  });

  app.get(
    "/api/v1/auth/me",
    {
      preHandler: [requireAuth]
    },
    async (request) => {
      return { user: getCurrentUser(request) };
    }
  );

  registerMatchRoutes(app, pool);

  if (!options.pool) {
    app.addHook("onClose", async () => {
      await pool.end();
    });
  }

  return app;
}
