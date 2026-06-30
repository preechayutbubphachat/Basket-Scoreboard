import type { FastifyInstance } from "fastify";

const diagnosticsEnabled = () => process.env.DEPLOY_DIAGNOSTICS === "true";

export function registerDeployDiagnosticsRoutes(app: FastifyInstance) {
  if (!diagnosticsEnabled()) {
    return;
  }

  app.post("/api/v1/_diag/post-probe", async () => {
    return {
      ok: true,
      method: "POST",
      path: "/api/v1/_diag/post-probe",
      reachedFastify: true
    };
  });
}
