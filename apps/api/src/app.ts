import Fastify from "fastify";
import { healthResponseSchema } from "@basket-scoreboard/api-contracts";

export function buildApiApp() {
  const app = Fastify({
    logger: false
  });

  app.get("/api/v1/health", async () => {
    return healthResponseSchema.parse({
      status: "ok",
      service: "basket-scoreboard-api"
    });
  });

  return app;
}
