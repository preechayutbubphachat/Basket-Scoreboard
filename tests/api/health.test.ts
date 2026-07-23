import { describe, expect, it } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

describe("health endpoint", () => {
  it("returns an ok status for the API", async () => {
    const app = buildApiApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "basket-scoreboard-api"
    });
  });
});

describe("correction command routes", () => {
  it("rejects malformed correction requests with the safe validation error shape", async () => {
    const previousDisableCsrf = process.env.AUTH_TEST_DISABLE_CSRF;
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/matches/00000000-0000-4000-8000-000000000010/commands/corrections/request",
        headers: {
          "x-dev-user-role": "ADMIN",
          "x-dev-user-id": "00000000-0000-4000-8000-000000000010"
        },
        payload: {}
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: {
          reasonCode: "VALIDATION_ERROR",
          message: "Request validation failed"
        }
      });
    } finally {
      await app.close();
      if (previousDisableCsrf === undefined) {
        delete process.env.AUTH_TEST_DISABLE_CSRF;
      } else {
        process.env.AUTH_TEST_DISABLE_CSRF = previousDisableCsrf;
      }
    }
  });
});

describe("auth foundation", () => {
  it("returns the current dev-authenticated user outside production", async () => {
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: {
          "x-dev-user-role": "SCORER",
          "x-dev-user-id": "00000000-0000-4000-8000-000000000011",
          "x-dev-match-ids": "00000000-0000-4000-8000-000000000012"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        data: {
          user: {
            userId: "00000000-0000-4000-8000-000000000011",
            role: "SCORER",
            assignedMatchIds: ["00000000-0000-4000-8000-000000000012"],
            authMode: "DEV_HEADER"
          }
        }
      });
    } finally {
      await app.close();
    }
  });

  it("disables dev auth headers in production unless explicitly enabled", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousDevAuthEnabled = process.env.DEV_AUTH_ENABLED;
    process.env.NODE_ENV = "production";
    delete process.env.DEV_AUTH_ENABLED;
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: {
          "x-dev-user-role": "ADMIN"
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: { reasonCode: "DEV_AUTH_DISABLED" }
      });
    } finally {
      await app.close();
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousDevAuthEnabled === undefined) {
        delete process.env.DEV_AUTH_ENABLED;
      } else {
        process.env.DEV_AUTH_ENABLED = previousDevAuthEnabled;
      }
    }
  });
});
