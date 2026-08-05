import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";
import { createAuthHandlers } from "../../apps/api/src/auth/sessionAuth";

const matchId = "11111111-1111-4111-8111-111111111111";

type EnvValue = string | undefined;

async function withEnvironment(values: Record<string, EnvValue>, callback: () => Promise<void>) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function devHeaders(role = "ADMIN") {
  return {
    "x-dev-user-role": role,
    "x-dev-user-id": "h-arch-001-dev-user",
    "x-dev-match-ids": matchId
  };
}

describe("H-ARCH-001 production DEV_HEADER boundary", () => {
  it.each([undefined, "true", "false", "unexpected"] as const)(
    "rejects a dev header in production with AUTH_DEV_HEADER_ENABLED=%s",
    async (flag) => {
      await withEnvironment({ NODE_ENV: "production", AUTH_DEV_HEADER_ENABLED: flag }, async () => {
        const app = buildApiApp({ pool: {} as never });
        try {
          const response = await app.inject({
            method: "GET",
            url: "/api/v1/auth/me",
            headers: devHeaders()
          });

          expect(response.statusCode).toBe(401);
          expect(response.json()).toMatchObject({ error: { reasonCode: "DEV_AUTH_DISABLED" } });
        } finally {
          await app.close();
        }
      });
    }
  );

  it("allows development dev-header authentication only with an explicit true flag", async () => {
    await withEnvironment({ NODE_ENV: "development", AUTH_DEV_HEADER_ENABLED: "true" }, async () => {
      const app = buildApiApp({ pool: {} as never });
      try {
        const response = await app.inject({
          method: "GET",
          url: "/api/v1/auth/me",
          headers: devHeaders("SCORER")
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          ok: true,
          data: { user: { role: "SCORER", authMode: "DEV_HEADER" } }
        });
      } finally {
        await app.close();
      }
    });
  });

  it.each([undefined, "false", "unexpected"] as const)(
    "rejects a development dev header when AUTH_DEV_HEADER_ENABLED=%s",
    async (flag) => {
      await withEnvironment({ NODE_ENV: "development", AUTH_DEV_HEADER_ENABLED: flag }, async () => {
        const app = buildApiApp({ pool: {} as never });
        try {
          const response = await app.inject({
            method: "GET",
            url: "/api/v1/auth/me",
            headers: devHeaders("SCORER")
          });

          expect(response.statusCode).toBe(401);
          expect(response.json()).toMatchObject({ error: { reasonCode: "DEV_AUTH_DISABLED" } });
        } finally {
          await app.close();
        }
      });
    }
  );

  it("fails closed for an unknown NODE_ENV even when the flag is true", async () => {
    await withEnvironment({ NODE_ENV: "staging", AUTH_DEV_HEADER_ENABLED: "true" }, async () => {
      const app = buildApiApp({ pool: {} as never });
      try {
        const response = await app.inject({
          method: "GET",
          url: "/api/v1/auth/me",
          headers: devHeaders()
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({ error: { reasonCode: "DEV_AUTH_DISABLED" } });
      } finally {
        await app.close();
      }
    });
  });

  it("blocks ADMIN and assigned-match authorization before creating a session principal", async () => {
    await withEnvironment({ NODE_ENV: "production", AUTH_DEV_HEADER_ENABLED: "true" }, async () => {
      let connectionAttempts = 0;
      const pool = {
        async getConnection() {
          connectionAttempts += 1;
          throw new Error("denied dev-header request must not open a session connection");
        }
      } as never;
      const app = Fastify({ logger: false });
      const auth = createAuthHandlers(pool);

      app.get(
        "/h-arch-001/admin",
        { preHandler: [auth.requireAuth, auth.requirePermission("match.create")] },
        async () => ({ privileged: true })
      );
      app.get(
        "/h-arch-001/matches/:matchId",
        {
          preHandler: [
            auth.requireAuth,
            auth.requireMatchPermission("match.read", (request) =>
              (request.params as { matchId: string }).matchId
            )
          ]
        },
        async () => ({ assigned: true })
      );

      try {
        const adminResponse = await app.inject({
          method: "GET",
          url: "/h-arch-001/admin",
          headers: devHeaders()
        });
        const assignedResponse = await app.inject({
          method: "GET",
          url: `/h-arch-001/matches/${matchId}`,
          headers: devHeaders()
        });

        expect(adminResponse.statusCode).toBe(401);
        expect(assignedResponse.statusCode).toBe(401);
        expect(adminResponse.json()).toMatchObject({ error: { reasonCode: "DEV_AUTH_DISABLED" } });
        expect(assignedResponse.json()).toMatchObject({ error: { reasonCode: "DEV_AUTH_DISABLED" } });
        expect(connectionAttempts).toBe(0);
      } finally {
        await app.close();
      }
    });
  });
});
