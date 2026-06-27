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
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/matches/00000000-0000-4000-8000-000000000010/commands/corrections/request",
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
    }
  });
});
