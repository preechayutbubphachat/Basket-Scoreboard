import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

let loaded = false;

export function loadServerEnv(logger: Pick<Console, "info"> = console) {
  if (loaded) {
    return;
  }

  loaded = true;
  const envPath = findRootEnvFile();

  if (!envPath) {
    return;
  }

  loadDotenv({
    path: envPath,
    override: false,
    quiet: true
  });
  logger.info(`[ENV_LOADER] Loaded server environment file: ${envPath}`);
}

function findRootEnvFile() {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const starts = [process.cwd(), moduleDir];
  const seen = new Set<string>();

  for (const start of starts) {
    let current = path.resolve(start);

    while (!seen.has(current)) {
      seen.add(current);
      const candidate = path.join(current, ".env");

      if (existsSync(candidate)) {
        return candidate;
      }

      const parent = path.dirname(current);

      if (parent === current) {
        break;
      }

      current = parent;
    }
  }

  return null;
}
