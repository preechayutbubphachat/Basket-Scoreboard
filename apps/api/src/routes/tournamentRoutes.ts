import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "mysql2/promise";
import { reasonCodes } from "@basket-scoreboard/api-contracts";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { apiError } from "../errors/apiErrors.js";
import { getTournamentSchedule, listTournamentSummaries } from "../tournaments/tournamentScheduleService.js";

export function registerTournamentRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
) {
  app.get(
    "/api/v1/tournaments",
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
          tournaments: await listTournamentSummaries(pool)
        }
      };
    }
  );

  app.get<{ Params: { tournamentId: string } }>(
    "/api/v1/tournaments/:tournamentId/schedule",
    {
      preHandler: [auth.requireAuth]
    },
    async (request, reply) => {
      const user = request.user as AuthenticatedUser;
      if (user.role !== "ADMIN") {
        return reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Admin role is required"));
      }

      const schedule = await getTournamentSchedule(pool, request.params.tournamentId);
      if (!schedule) {
        return reply.status(404).send(apiError(reasonCodes.MATCH_NOT_FOUND, "Tournament schedule was not found"));
      }

      return {
        ok: true,
        data: schedule
      };
    }
  );

  app.get("/api/v1/public/tournaments", async () => {
    return {
      ok: true,
      data: {
        tournaments: await listTournamentSummaries(pool, { publicOnly: true })
      }
    };
  });

  app.get<{ Params: { tournamentId: string } }>(
    "/api/v1/public/tournaments/:tournamentId/schedule",
    async (request, reply) => {
      const schedule = await getTournamentSchedule(pool, request.params.tournamentId, { publicOnly: true });
      if (!schedule) {
        return reply.status(404).send(apiError(reasonCodes.MATCH_NOT_FOUND, "Public tournament schedule was not found"));
      }

      return {
        ok: true,
        data: schedule
      };
    }
  );
}
