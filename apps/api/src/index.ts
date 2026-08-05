import { loadServerEnv } from "./config/loadEnv.js";
import { buildApiApp } from "./app.js";
import { logStartupDiagnostics } from "./deployment/startupDiagnostics.js";

loadServerEnv();

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const app = buildApiApp();
logStartupDiagnostics(app);

try {
  await app.listen({ port, host });
  app.log.info(`API listening on http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
