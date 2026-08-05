import { afterEach, describe, expect, it } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

const originalAllowedOrigins = process.env.API_ALLOWED_ORIGINS;
const originalCorsCredentials = process.env.API_CORS_CREDENTIALS;

afterEach(() => {
  if (originalAllowedOrigins === undefined) {
    delete process.env.API_ALLOWED_ORIGINS;
  } else {
    process.env.API_ALLOWED_ORIGINS = originalAllowedOrigins;
  }

  if (originalCorsCredentials === undefined) {
    delete process.env.API_CORS_CREDENTIALS;
  } else {
    process.env.API_CORS_CREDENTIALS = originalCorsCredentials;
  }
});

describe("split-domain API CORS", () => {
  it("allows configured frontend origins with credentials", async () => {
    process.env.API_ALLOWED_ORIGINS = "https://scoreboard.ob-gate.com";
    process.env.API_CORS_CREDENTIALS = "true";
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/health",
        headers: {
          origin: "https://scoreboard.ob-gate.com"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBe("https://scoreboard.ob-gate.com");
      expect(response.headers["access-control-allow-credentials"]).toBe("true");
      expect(response.headers["access-control-allow-methods"]).toContain("POST");
      expect(response.headers["access-control-allow-headers"]).toContain("x-csrf-token");
    } finally {
      await app.close();
    }
  });

  it("does not approve disallowed origins for credentialed CORS", async () => {
    process.env.API_ALLOWED_ORIGINS = "https://scoreboard.ob-gate.com";
    process.env.API_CORS_CREDENTIALS = "true";
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/health",
        headers: {
          origin: "https://evil.example"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
      expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("handles auth login preflight for allowed frontend origins", async () => {
    process.env.API_ALLOWED_ORIGINS = "https://scoreboard.ob-gate.com";
    process.env.API_CORS_CREDENTIALS = "true";
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/v1/auth/login",
        headers: {
          origin: "https://scoreboard.ob-gate.com",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type,x-csrf-token"
        }
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe("https://scoreboard.ob-gate.com");
      expect(response.headers["access-control-allow-credentials"]).toBe("true");
      expect(response.headers["access-control-allow-methods"]).toContain("POST");
      expect(response.headers["access-control-allow-headers"]).toContain("Content-Type");
    } finally {
      await app.close();
    }
  });
});
