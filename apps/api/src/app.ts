import Fastify from "fastify";
import { healthResponseSchema } from "@basket-scoreboard/api-contracts";
import type { Pool } from "mysql2/promise";
import { createDatabasePool } from "./db";
import { registerMatchRoutes } from "./routes/matchRoutes";

export function buildApiApp(options: { pool?: Pool } = {}) {
  const app = Fastify({
    logger: false
  });
  const pool = options.pool ?? createDatabasePool();

  app.get("/api/v1/health", async () => {
    return healthResponseSchema.parse({
      status: "ok",
      service: "basket-scoreboard-api"
    });
  });

  registerMatchRoutes(app, pool);

  if (!options.pool) {
    app.addHook("onClose", async () => {
      await pool.end();
    });
  }

  return app;
}
