import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "mysql2/promise";
import {
  createCourtSchema,
  createTeamSchema,
  createTournamentMatchSchema,
  createTournamentSchema,
  createVenueSchema,
  reasonCodes,
  type ReasonCode
} from "@basket-scoreboard/api-contracts";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { apiError } from "../errors/apiErrors.js";
import { canAccessOperatorMatches } from "../operator/operatorMatchService.js";
import {
  getTournamentLiveDashboard,
  getTournamentSchedule,
  listTournamentSummaries
} from "../tournaments/tournamentScheduleService.js";
import { getTournamentStandings } from "../tournaments/tournamentStandingsService.js";
import {
  createScheduledTournamentMatch,
  createTournamentSetup,
  createTournamentSetupTeam,
  listTournamentSetupTeams
} from "../tournaments/tournamentSetupService.js";
import {
  createCourtSetup,
  createVenueSetup,
  listVenuesWithCourts
} from "../tournaments/venueCourtService.js";

export function registerTournamentRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    requireCsrf: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
) {
  function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as AuthenticatedUser;
    if (user.role !== "ADMIN") {
      void reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Admin role is required"));
      return false;
    }
    return true;
  }

  app.get(
    "/api/v1/tournaments",
    {
      preHandler: [auth.requireAuth]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      return {
        ok: true,
        data: {
          tournaments: await listTournamentSummaries(pool)
        }
      };
    }
  );

  app.post(
    "/api/v1/tournaments",
    {
      preHandler: [auth.requireAuth, auth.requireCsrf]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const input = createTournamentSchema.parse(request.body);
      const tournament = await createTournamentSetup(pool, input);
      return reply.status(201).send({
        ok: true,
        data: { tournament }
      });
    }
  );

  app.get(
    "/api/v1/teams",
    {
      preHandler: [auth.requireAuth]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      return {
        ok: true,
        data: {
          teams: await listTournamentSetupTeams(pool)
        }
      };
    }
  );

  app.post(
    "/api/v1/teams",
    {
      preHandler: [auth.requireAuth, auth.requireCsrf]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const input = createTeamSchema.parse(request.body);
      const team = await createTournamentSetupTeam(pool, input);
      return reply.status(201).send({
        ok: true,
        data: { team }
      });
    }
  );

  app.get(
    "/api/v1/venues",
    {
      preHandler: [auth.requireAuth]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      return {
        ok: true,
        data: {
          venues: await listVenuesWithCourts(pool)
        }
      };
    }
  );

  app.post(
    "/api/v1/venues",
    {
      preHandler: [auth.requireAuth, auth.requireCsrf]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const input = createVenueSchema.parse(request.body);
      const result = await createVenueSetup(pool, input);
      if (!result.ok) {
        return reply.status(result.statusCode).send(apiError(result.reasonCode, result.message));
      }

      return reply.status(result.statusCode).send({
        ok: true,
        data: { venue: result.value }
      });
    }
  );

  app.post<{ Params: { venueId: string } }>(
    "/api/v1/venues/:venueId/courts",
    {
      preHandler: [auth.requireAuth, auth.requireCsrf]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const input = createCourtSchema.parse(request.body);
      const result = await createCourtSetup(pool, request.params.venueId, input);
      if (!result.ok) {
        return reply.status(result.statusCode).send(apiError(result.reasonCode, result.message));
      }

      return reply.status(result.statusCode).send({
        ok: true,
        data: { court: result.value }
      });
    }
  );

  app.post<{ Params: { tournamentId: string } }>(
    "/api/v1/tournaments/:tournamentId/matches",
    {
      preHandler: [auth.requireAuth, auth.requireCsrf]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const input = createTournamentMatchSchema.parse(request.body);
      const result = await createScheduledTournamentMatch(pool, request.params.tournamentId, input);
      if (!result.ok) {
        return reply
          .status(result.statusCode)
          .send(apiError(result.reasonCode as ReasonCode, result.message));
      }

      return reply.status(result.statusCode).send({
        ok: true,
        data: result.value
      });
    }
  );

  app.get<{ Params: { tournamentId: string } }>(
    "/api/v1/tournaments/:tournamentId/schedule",
    {
      preHandler: [auth.requireAuth]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
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

  app.get<{ Params: { tournamentId: string } }>(
    "/api/v1/tournaments/:tournamentId/live-dashboard",
    {
      preHandler: [auth.requireAuth]
    },
    async (request, reply) => {
      const user = request.user as AuthenticatedUser;
      if (!canAccessOperatorMatches(user)) {
        return reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Operator access is required"));
      }

      if (user.role !== "ADMIN" && user.assignedMatchIds.length === 0) {
        return reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Active match assignment is required"));
      }

      if (user.role !== "ADMIN") {
        const schedule = await getTournamentSchedule(pool, request.params.tournamentId);
        const hasTournamentAssignment = schedule?.matches.some((match) => user.assignedMatchIds.includes(match.matchId)) ?? false;
        if (!hasTournamentAssignment) {
          return reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Tournament match assignment is required"));
        }
      }

      const dashboard = await getTournamentLiveDashboard(pool, request.params.tournamentId);
      if (!dashboard) {
        return reply.status(404).send(apiError(reasonCodes.MATCH_NOT_FOUND, "Tournament live dashboard was not found"));
      }

      return {
        ok: true,
        data: dashboard
      };
    }
  );

  app.get<{ Params: { tournamentId: string } }>(
    "/api/v1/tournaments/:tournamentId/standings",
    {
      preHandler: [auth.requireAuth]
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const standings = await getTournamentStandings(pool, request.params.tournamentId);
      if (!standings) {
        return reply.status(404).send(apiError(reasonCodes.MATCH_NOT_FOUND, "Tournament standings were not found"));
      }

      return {
        ok: true,
        data: standings
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

  app.get<{ Params: { tournamentId: string } }>(
    "/api/v1/public/tournaments/:tournamentId/standings",
    async (request, reply) => {
      const standings = await getTournamentStandings(pool, request.params.tournamentId, { publicOnly: true });
      if (!standings) {
        return reply.status(404).send(apiError(reasonCodes.MATCH_NOT_FOUND, "Public tournament standings were not found"));
      }

      return {
        ok: true,
        data: standings
      };
    }
  );
}
