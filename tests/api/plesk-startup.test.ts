import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Plesk root startup wrapper", () => {
  it("starts the built API entrypoint from the root app.js file", () => {
    const appJs = readFileSync(join(process.cwd(), "app.js"), "utf8");

    expect(appJs).toContain('path.join(__dirname, "apps", "api", "dist", "index.js")');
    expect(appJs).toContain("fs.existsSync(apiEntry)");
    expect(appJs).toContain("[PLESK_STARTUP_ERROR]");
    expect(appJs).toContain("npm run build");
    expect(appJs).toContain("pathToFileURL(apiEntry).href");
    expect(appJs).toContain("import(");
    expect(appJs).not.toContain("src/server.ts");
    expect(appJs).not.toContain("migrate");
    expect(appJs).not.toContain("Socket.IO");
  });

  it("exposes the root start script Plesk can run", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.start).toBe("node app.js");
  });
});
