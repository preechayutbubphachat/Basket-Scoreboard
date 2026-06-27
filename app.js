import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiEntry = path.join(__dirname, "apps", "api", "dist", "index.js");

if (!fs.existsSync(apiEntry)) {
  console.error("[PLESK_STARTUP_ERROR] API build output not found:", apiEntry);
  console.error('Run "npm install" and "npm run build" from the project root before starting the app.');
  process.exit(1);
}

Promise.resolve()
  .then(() => import(pathToFileURL(apiEntry).href))
  .catch((error) => {
    console.error("[PLESK_STARTUP_ERROR] Failed to start API application.");
    console.error(error);
    process.exit(1);
  });
