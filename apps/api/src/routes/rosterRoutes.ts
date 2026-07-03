import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "mysql2/promise";
import {
  assignRosterPlayerSchema,
  createPlayerSchema,
  lineupActionSchema,
  reasonCodes,
  updatePlayerSchema,
  updateRosterPlayerSchema,
  type ReasonCode
} from "@basket-scoreboard/api-contracts";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { apiError } from "../errors/apiErrors.js";
import {
  assignPlayerToMatchRoster,
  confirmLineupRoster,
  createPlayer,
  listMatchLineup,
  listMatchRoster,
  listPlayersForTeam,
  removeLineupStarter,
  selectLineupStarter,
  setLineupCaptain,
  updateMatchRosterPlayer,
  updatePlayer
} from "../rosters/rosterRepository.js";

type TeamSide = "HOME" | "AWAY";

export function registerRosterRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    requireMatchPermission: (
      permission: "match.read",
      getMatchId: (request: FastifyRequest) => string
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    requireCsrf: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
) {
  app.get<{ Params: { teamId: string } }>(
    "/api/v1/teams/:teamId/players",
    { preHandler: [auth.requireAuth] },
    async (request, reply) => {
      if (!isAdmin(request.user)) {
        return reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Admin role is required"));
      }

      return {
        ok: true,
        data: {
          players: await listPlayersForTeam(pool, request.params.teamId)
        }
      };
    }
  );

  app.post<{ Params: { teamId: string } }>(
    "/api/v1/teams/:teamId/players",
    { preHandler: [auth.requireAuth, auth.requireCsrf] },
    async (request, reply) => {
      if (!isAdmin(request.user)) {
        return reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Admin role is required"));
      }

      const input = createPlayerSchema.parse(request.body);
      const result = await createPlayer(pool, request.params.teamId, input);
      if (!result.ok) {
        return reply.status(result.statusCode).send(apiError(result.reasonCode as ReasonCode, result.message));
      }

      return reply.status(result.statusCode).send({
        ok: true,
        data: { player: result.player }
      });
    }
  );

  app.patch<{ Params: { teamId: string; playerId: string } }>(
    "/api/v1/teams/:teamId/players/:playerId",
    { preHandler: [auth.requireAuth, auth.requireCsrf] },
    async (request, reply) => {
      if (!isAdmin(request.user)) {
        return reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Admin role is required"));
      }

      const input = updatePlayerSchema.parse(request.body);
      const result = await updatePlayer(pool, request.params.teamId, request.params.playerId, input);
      if (!result.ok) {
        return reply.status(result.statusCode).send(apiError(result.reasonCode as ReasonCode, result.message));
      }

      return {
        ok: true,
        data: { player: result.player }
      };
    }
  );

  app.get<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/rosters",
    {
      preHandler: [
        auth.requireAuth,
        auth.requireMatchPermission("match.read", (request) => (request.params as { matchId: string }).matchId)
      ]
    },
    async (request, reply) => {
      const roster = await listMatchRoster(pool, request.params.matchId);
      if (!roster) {
        return reply.status(404).send(apiError(reasonCodes.MATCH_NOT_FOUND, "Match was not found"));
      }

      return {
        ok: true,
        data: roster
      };
    }
  );

  app.get<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/lineup",
    {
      preHandler: [
        auth.requireAuth,
        auth.requireMatchPermission("match.read", (request) => (request.params as { matchId: string }).matchId)
      ]
    },
    async (request, reply) => {
      const lineup = await listMatchLineup(pool, request.params.matchId);
      if (!lineup) {
        return reply.status(404).send(apiError(reasonCodes.MATCH_NOT_FOUND, "Match was not found"));
      }

      return {
        ok: true,
        data: lineup
      };
    }
  );

  app.post<{ Params: { matchId: string; teamSide: string; playerId: string } }>(
    "/api/v1/matches/:matchId/lineup/:teamSide/starters/:playerId",
    { preHandler: [auth.requireAuth, auth.requireCsrf] },
    async (request, reply) => {
      if (!isAdmin(request.user)) {
        return reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Admin role is required"));
      }
      const teamSide = parseTeamSide(request.params.teamSide);
      if (!teamSide) {
        return reply.status(400).send(apiError(reasonCodes.VALIDATION_ERROR, "Invalid lineup team side"));
      }
      const input = lineupActionSchema.parse(request.body ?? {});
      const result = await selectLineupStarter(pool, {
        matchId: request.params.matchId,
        teamSide,
        playerId: request.params.playerId,
        input
      });
      return sendLineupMutationResult(reply, result);
    }
  );

  app.post<{ Params: { matchId: string; teamSide: string; playerId: string } }>(
    "/api/v1/matches/:matchId/lineup/:teamSide/starters/:playerId/remove",
    { preHandler: [auth.requireAuth, auth.requireCsrf] },
    async (request, reply) => {
      if (!isAdmin(request.user)) {
        return reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Admin role is required"));
      }
      const teamSide = parseTeamSide(request.params.teamSide);
      if (!teamSide) {
        return reply.status(400).send(apiError(reasonCodes.VALIDATION_ERROR, "Invalid lineup team side"));
      }
      const input = lineupActionSchema.parse(request.body ?? {});
      const result = await removeLineupStarter(pool, {
        matchId: request.params.matchId,
        teamSide,
        playerId: request.params.playerId,
        input
      });
      return sendLineupMutationResult(reply, result);
    }
  );

  app.post<{ Params: { matchId: string; teamSide: string; playerId: string } }>(
    "/api/v1/matches/:matchId/lineup/:teamSide/captain/:playerId",
    { preHandler: [auth.requireAuth, auth.requireCsrf] },
    async (request, reply) => {
      if (!isAdmin(request.user)) {
        return reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Admin role is required"));
      }
      const teamSide = parseTeamSide(request.params.teamSide);
      if (!teamSide) {
        return reply.status(400).send(apiError(reasonCodes.VALIDATION_ERROR, "Invalid lineup team side"));
      }
      const input = lineupActionSchema.parse(request.body ?? {});
      const result = await setLineupCaptain(pool, {
        matchId: request.params.matchId,
        teamSide,
        playerId: request.params.playerId,
        input
      });
      return sendLineupMutationResult(reply, result);
    }
  );

  app.post<{ Params: { matchId: string; teamSide: string } }>(
    "/api/v1/matches/:matchId/lineup/:teamSide/confirm",
    { preHandler: [auth.requireAuth, auth.requireCsrf] },
    async (request, reply) => {
      if (!isAdmin(request.user)) {
        return reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Admin role is required"));
      }
      const teamSide = parseTeamSide(request.params.teamSide);
      if (!teamSide) {
        return reply.status(400).send(apiError(reasonCodes.VALIDATION_ERROR, "Invalid lineup team side"));
      }
      const input = lineupActionSchema.parse(request.body ?? {});
      const result = await confirmLineupRoster(pool, {
        matchId: request.params.matchId,
        teamSide,
        input,
        actorUserId: request.user?.userId ?? null
      });
      return sendLineupMutationResult(reply, result);
    }
  );

  app.post<{ Params: { matchId: string; teamSide: string } }>(
    "/api/v1/matches/:matchId/rosters/:teamSide/players",
    { preHandler: [auth.requireAuth, auth.requireCsrf] },
    async (request, reply) => {
      if (!isAdmin(request.user)) {
        return reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Admin role is required"));
      }

      const teamSide = parseTeamSide(request.params.teamSide);
      if (!teamSide) {
        return reply.status(400).send(apiError(reasonCodes.VALIDATION_ERROR, "Invalid roster team side"));
      }

      const input = assignRosterPlayerSchema.parse(request.body);
      const result = await assignPlayerToMatchRoster(pool, {
        matchId: request.params.matchId,
        teamSide,
        playerId: input.playerId
      });
      if (!result.ok) {
        return reply.status(result.statusCode).send(apiError(result.reasonCode as ReasonCode, result.message));
      }

      return reply.status(result.statusCode).send({
        ok: true,
        data: { rosterPlayer: result.entry }
      });
    }
  );

  app.patch<{ Params: { matchId: string; teamSide: string; playerId: string } }>(
    "/api/v1/matches/:matchId/rosters/:teamSide/players/:playerId",
    { preHandler: [auth.requireAuth, auth.requireCsrf] },
    async (request, reply) => {
      if (!isAdmin(request.user)) {
        return reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Admin role is required"));
      }

      const teamSide = parseTeamSide(request.params.teamSide);
      if (!teamSide) {
        return reply.status(400).send(apiError(reasonCodes.VALIDATION_ERROR, "Invalid roster team side"));
      }

      const input = updateRosterPlayerSchema.parse(request.body);
      const result = await updateMatchRosterPlayer(pool, {
        matchId: request.params.matchId,
        teamSide,
        playerId: request.params.playerId,
        input
      });
      if (!result.ok) {
        return reply.status(result.statusCode).send(apiError(result.reasonCode as ReasonCode, result.message));
      }

      return {
        ok: true,
        data: { rosterPlayer: result.entry }
      };
    }
  );
}

function sendLineupMutationResult(
  reply: FastifyReply,
  result:
    | { ok: true; statusCode: number; lineup: Awaited<ReturnType<typeof listMatchLineup>> }
    | { ok: false; statusCode: number; reasonCode: string; message: string }
) {
  if (!result.ok) {
    return reply.status(result.statusCode).send(apiError(result.reasonCode as ReasonCode, result.message));
  }
  return reply.status(result.statusCode).send({
    ok: true,
    data: result.lineup
  });
}

function isAdmin(user: AuthenticatedUser | undefined) {
  return user?.role === "ADMIN";
}

function parseTeamSide(value: string): TeamSide | null {
  const normalized = value.toUpperCase();
  return normalized === "HOME" || normalized === "AWAY" ? normalized : null;
}
