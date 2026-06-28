import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import { reasonCodes } from "@basket-scoreboard/api-contracts";
import { apiError } from "../errors/apiErrors.js";
import {
  clearSessionCookie,
  loginWithPassword,
  rotateCsrfToken,
  revokeCurrentSession,
  serializeUser,
  type AuthenticatedUser
} from "../auth/sessionAuth.js";

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(500)
});

export function registerAuthRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    requireCsrf: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
) {
  app.post("/api/v1/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const result = await loginWithPassword(pool, input);

    if (!result.ok) {
      const message =
        result.error === reasonCodes.USER_INACTIVE ? "User is inactive" : "Invalid credentials";
      return reply.status(result.status).send(apiError(result.error, message));
    }

    return reply
      .header("set-cookie", result.cookie)
      .send({
        ok: true,
        data: {
          user: serializeUser(result.user),
          csrfToken: result.csrfToken
        }
      });
  });

  app.get(
    "/api/v1/auth/me",
    {
      preHandler: [auth.requireAuth]
    },
    async (request) => {
      return {
        ok: true,
        data: {
          user: serializeUser(request.user as AuthenticatedUser)
        }
      };
    }
  );

  app.get(
    "/api/v1/auth/csrf",
    {
      preHandler: [auth.requireAuth]
    },
    async (request, reply) => {
      const user = request.user as AuthenticatedUser;

      if (!user.sessionId) {
        return reply.status(403).send(apiError(reasonCodes.CSRF_REQUIRED, "CSRF token is required"));
      }
      const csrfToken = await rotateCsrfToken(pool, user);

      return {
        ok: true,
        data: {
          csrfToken
        }
      };
    }
  );

  app.post(
    "/api/v1/auth/logout",
    {
      preHandler: [auth.requireAuth, auth.requireCsrf]
    },
    async (request, reply) => {
      await revokeCurrentSession(pool, request.user as AuthenticatedUser);

      return reply.header("set-cookie", clearSessionCookie()).send({
        ok: true,
        data: {
          loggedOut: true
        }
      });
    }
  );
}
