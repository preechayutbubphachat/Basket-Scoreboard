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
