import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool, RowDataPacket } from "mysql2/promise";
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
import { getRosterBaselineProjection, importRosterBaseline } from "../rosters/rosterBaselineService.js";
import type { ProjectionRealtime } from "../realtime/projectionRealtime.js";

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
    requireProtectedRosterAccess: (getMatchId: (request: FastifyRequest) => string) => (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    requireCsrf: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  },
  realtime?: ProjectionRealtime
) {
  app.get<{ Params: { matchId: string; teamSide: string } }>(
    "/api/v1/public/matches/:matchId/roster-baseline/:teamSide",
    async (request, reply) => {
      const teamSide = parseTeamSide(request.params.teamSide);
      if (!teamSide) return reply.status(400).send(apiError(reasonCodes.VALIDATION_ERROR, "Invalid roster team side"));
      const projection = await getRosterBaselineProjection(pool, request.params.matchId, teamSide, "public");
      if (!projection) return reply.status(404).send(apiError(reasonCodes.MATCH_NOT_FOUND, "Roster baseline was not found"));
      return { ok: true, data: projection };
    }
  );

  app.get<{ Params: { matchId: string; teamSide: string } }>(
    "/api/v1/matches/:matchId/roster-baseline/:teamSide",
    { preHandler: [auth.requireAuth, auth.requireProtectedRosterAccess((request) => (request.params as { matchId: string }).matchId)] },
    async (request, reply) => {
      const teamSide = parseTeamSide(request.params.teamSide);
      if (!teamSide) return reply.status(400).send(apiError(reasonCodes.VALIDATION_ERROR, "Invalid roster team side"));
      const projection = await getRosterBaselineProjection(pool, request.params.matchId, teamSide, "protected");
      if (!projection) return reply.status(404).send(apiError(reasonCodes.MATCH_NOT_FOUND, "Roster baseline was not found"));
      return { ok: true, data: projection };
    }
  );

  app.post<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/roster-baseline/import",
    { preHandler: [auth.requireAuth, auth.requireCsrf, auth.requireProtectedRosterAccess((request) => (request.params as { matchId: string }).matchId)] },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      if (!body || Object.keys(body).length !== 1 || !parseTeamSide(String(body.teamSide ?? ""))) {
        return reply.status(400).send(apiError(reasonCodes.VALIDATION_ERROR, "Roster baseline import accepts only teamSide"));
      }
      const expectedSeq = Number(request.headers["x-expected-seq"]);
      const commandId = String(request.headers["idempotency-key"] ?? "");
      if (!Number.isSafeInteger(expectedSeq) || expectedSeq < 0 || !/^[0-9a-f-]{36}$/i.test(commandId)) {
        return reply.status(400).send(apiError(reasonCodes.VALIDATION_ERROR, "x-expected-seq and Idempotency-Key are required"));
      }
      const teamSide = parseTeamSide(String(body.teamSide))!;
      const result = await importRosterBaseline({ pool, command: { matchId: request.params.matchId, teamSide, expectedSeq, commandId, correlationId: String(request.headers["x-correlation-id"] ?? commandId) }, user: request.user! });
      if (result.status === "ACCEPTED" && result.projection) {
        const publicProjection = await getRosterBaselineProjection(pool, request.params.matchId, teamSide, "public");
        await realtime?.emitRosterBaselineUpdated({ matchId: request.params.matchId, teamSide, protectedProjection: result.projection, publicProjection: publicProjection ?? {} });
      }
      return reply.status(result.status === "SYNC_REQUIRED" ? 409 : result.status === "REJECTED" ? 422 : 200).send(result);
    }
  );
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
        auth.requireProtectedRosterAccess((request) => (request.params as { matchId: string }).matchId)
      ]
    },
    async (request, reply) => {
      if (await hasAuthoritativeBaseline(pool, request.params.matchId)) {
        return reply.status(409).send(apiError("ROSTER_BASELINE_AUTHORITATIVE" as ReasonCode, "Use the authoritative roster-baseline endpoint for this match"));
      }
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
        auth.requireProtectedRosterAccess((request) => (request.params as { matchId: string }).matchId)
      ]
    },
    async (request, reply) => {
      if (await hasAuthoritativeBaseline(pool, request.params.matchId)) {
        return reply.status(409).send(apiError("ROSTER_BASELINE_AUTHORITATIVE" as ReasonCode, "Use the authoritative roster-baseline endpoint for this match"));
      }
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
      const criticalFields = new Set(["roster_status", "status", "is_starter", "isStarter", "is_captain", "isCaptain", "confirmation", "readiness", "roster_version", "rosterVersion", "lock_state", "lockState"]);
      const body = (request.body ?? {}) as Record<string, unknown>;
      if (Object.keys(body).some((key) => criticalFields.has(key))) {
        return reply.status(409).send(apiError("LINEUP_CRITICAL_FIELD_REQUIRES_EXPLICIT_COMMAND" as ReasonCode, "Lineup-critical fields require explicit commands and cannot be changed through PATCH"));
      }
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

async function hasAuthoritativeBaseline(pool: Pool, matchId: string) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query<Array<RowDataPacket & { event_id?: string; event_type?: string }>>(
      "SELECT event_id, event_type FROM match_events WHERE match_id = ? AND event_type = 'MATCH_ROSTER_BASELINE_IMPORTED' LIMIT 1",
      [matchId]
    );
    return rows.some((row) => row.event_type === "MATCH_ROSTER_BASELINE_IMPORTED");
  } finally {
    connection.release();
  }
}

function parseTeamSide(value: string): TeamSide | null {
  const normalized = value.toUpperCase();
  return normalized === "HOME" || normalized === "AWAY" ? normalized : null;
}
