import { existsSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";

const apiPrefix = "/api/v1";

function resolveWebDistDir() {
  return process.env.WEB_DIST_DIR?.trim() || "apps/web/dist";
}

function resolveAppVersion() {
  return process.env.APP_VERSION?.trim() || process.env.COMMIT_SHA?.trim() || process.env.GIT_COMMIT?.trim() || "unknown";
}

export function getStartupDiagnostics() {
  const webDistDir = resolveWebDistDir();

  return {
    NODE_ENV: process.env.NODE_ENV || "development",
    WEB_DIST_DIR: webDistDir,
    indexHtmlExists: existsSync(join(process.cwd(), webDistDir, "index.html")),
    appVersion: resolveAppVersion(),
    apiPrefix
  };
}

export function logStartupDiagnostics(app: FastifyInstance) {
  const deployment = getStartupDiagnostics();
  console.info("[DEPLOYMENT_STARTUP]", JSON.stringify(deployment));
  app.log.info({ deployment }, "Deployment startup diagnostics");
}
