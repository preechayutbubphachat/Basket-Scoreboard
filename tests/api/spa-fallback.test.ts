import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

let frontendDistDir: string;

beforeEach(() => {
  frontendDistDir = mkdtempSync(join(tmpdir(), "basket-spa-dist-"));
  mkdirSync(join(frontendDistDir, "assets"));
  writeFileSync(
    join(frontendDistDir, "index.html"),
    '<!doctype html><html><head><title>Basketball Scoreboard</title></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>'
  );
  writeFileSync(join(frontendDistDir, "assets", "app.js"), "console.log('spa');");
  writeFileSync(join(frontendDistDir, "assets", "style.css"), "body{margin:0}");
});

afterEach(() => {
  rmSync(frontendDistDir, { force: true, recursive: true });
});

describe("Plesk SPA fallback", () => {
  it.each([
    "/login",
    "/admin/matches",
    "/operator/matches/test-match/score",
    "/public/scoreboard/test-match"
  ])("serves the Vite index shell for browser route %s", async (url) => {
    const app = buildApiApp({ pool: {} as never, frontendDistDir });

    try {
      const response = await app.inject({
        method: "GET",
        url,
        headers: { accept: "text/html" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.body).toContain('<div id="root"></div>');
    } finally {
      await app.close();
    }
  });

  it("keeps API health as JSON", async () => {
    const app = buildApiApp({ pool: {} as never, frontendDistDir });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/health",
        headers: { accept: "application/json" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.json()).toMatchObject({
        status: "ok",
        service: "basket-scoreboard-api"
      });
    } finally {
      await app.close();
    }
  });

  it("keeps API misses as JSON 404 instead of serving the SPA", async () => {
    const app = buildApiApp({ pool: {} as never, frontendDistDir });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/unknown",
        headers: { accept: "text/html" }
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.json()).toMatchObject({
        error: "Not Found",
        statusCode: 404
      });
      expect(response.body).not.toContain('<div id="root"></div>');
    } finally {
      await app.close();
    }
  });

  it("keeps POST API misses as JSON instead of serving HTML", async () => {
    const app = buildApiApp({ pool: {} as never, frontendDistDir });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/health",
        headers: { accept: "text/html" }
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.body).not.toContain("<!doctype html>");
    } finally {
      await app.close();
    }
  });

  it("serves built assets with content types when Node handles frontend assets", async () => {
    const app = buildApiApp({ pool: {} as never, frontendDistDir });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/assets/app.js"
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toMatch(/javascript/);
      expect(response.body).toBe("console.log('spa');");
    } finally {
      await app.close();
    }
  });

  it("does not serve index.html for unknown asset-like paths", async () => {
    const app = buildApiApp({ pool: {} as never, frontendDistDir });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/unknown.js",
        headers: { accept: "text/html" }
      });

      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain('<div id="root"></div>');
    } finally {
      await app.close();
    }
  });

  it("fails loudly in production when the frontend build is missing", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const missingDistDir = mkdtempSync(join(tmpdir(), "basket-missing-spa-dist-"));
    process.env.NODE_ENV = "production";

    try {
      expect(() => buildApiApp({ pool: {} as never, frontendDistDir: missingDistDir })).toThrow(
        /Frontend build output not found/
      );
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      rmSync(missingDistDir, { force: true, recursive: true });
    }
  });
});
