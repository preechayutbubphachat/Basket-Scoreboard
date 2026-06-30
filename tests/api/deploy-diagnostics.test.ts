import { afterEach, describe, expect, it } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

const previousDeployDiagnostics = process.env.DEPLOY_DIAGNOSTICS;

afterEach(() => {
  if (previousDeployDiagnostics === undefined) {
    delete process.env.DEPLOY_DIAGNOSTICS;
  } else {
    process.env.DEPLOY_DIAGNOSTICS = previousDeployDiagnostics;
  }
});

describe("deployment diagnostics", () => {
  it("returns a POST probe response when diagnostics are enabled", async () => {
    process.env.DEPLOY_DIAGNOSTICS = "true";
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/_diag/post-probe",
        headers: {
          authorization: "Bearer must-not-matter",
          cookie: "basket_session=must-not-matter"
        },
        payload: {
          password: "must-not-matter"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.json()).toEqual({
        ok: true,
        method: "POST",
        path: "/api/v1/_diag/post-probe",
        reachedFastify: true
      });
    } finally {
      await app.close();
    }
  });

  it("does not expose the POST probe when diagnostics are disabled", async () => {
    delete process.env.DEPLOY_DIAGNOSTICS;
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/_diag/post-probe"
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.body).not.toContain("reachedFastify");
    } finally {
      await app.close();
    }
  });
});
