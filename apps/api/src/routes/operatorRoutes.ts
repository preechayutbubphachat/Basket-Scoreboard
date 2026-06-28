import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "mysql2/promise";
import { reasonCodes } from "@basket-scoreboard/api-contracts";
import { apiError } from "../errors/apiErrors.js";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { canAccessOperatorMatches, listAdminMatches, listOperatorMatches } from "../operator/operatorMatchService.js";

export function registerOperatorRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
) {
  app.get(
    "/api/v1/operator/matches",
    {
      preHandler: [auth.requireAuth]
    },
    async (request, reply) => {
      const user = request.user as AuthenticatedUser;

      if (!canAccessOperatorMatches(user)) {
        return reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Operator access is required"));
      }

      return {
        ok: true,
        data: {
          matches: await listOperatorMatches(pool, user)
        }
      };
    }
  );

  app.get(
    "/api/v1/admin/matches",
    {
      preHandler: [auth.requireAuth]
    },
    async (request, reply) => {
      const user = request.user as AuthenticatedUser;

      if (user.role !== "ADMIN") {
        return reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Admin role is required"));
      }

      return {
        ok: true,
        data: {
          matches: await listAdminMatches(pool)
        }
      };
    }
  );
}
