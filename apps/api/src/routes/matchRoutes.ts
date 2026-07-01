import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "mysql2/promise";
import {
  addScoreCommandSchema,
  addPlayerFoulCommandSchema,
  addTeamFoulCommandSchema,
  applyScoreCorrectionCommandSchema,
  correctionRequestCommandSchema,
  createMatchSchema,
  gameClockSetCommandSchema,
  gameClockStartCommandSchema,
  gameClockStopCommandSchema,
  reasonCodes,
  rejectCorrectionCommandSchema,
  shotClockResetCommandSchema,
  shotClockSetCommandSchema,
  syncQuerySchema
} from "@basket-scoreboard/api-contracts";
import { appendScoreAddedCommand } from "../matchEventStore/appendScoreCommand.js";
import {
  appendGameClockSetCommand,
  appendGameClockStartCommand,
  appendGameClockStopCommand,
  appendShotClockResetCommand,
  appendShotClockSetCommand
} from "../matchEventStore/appendClockCommand.js";
import {
  appendPlayerFoulAddedCommand,
  appendTeamFoulAddedCommand
} from "../matchEventStore/appendFoulCommand.js";
import {
  applyScoreCorrection,
  listCorrectionsForMatch,
  rejectScoreCorrection,
  requestScoreCorrection
} from "../matchEventStore/correctionCommands.js";
import { createMatch } from "../matchEventStore/createMatch.js";
import {
  getScoreboardProjection,
  getScoreboardProjectionView,
  listMatchEvents
} from "../matchEventStore/repositories.js";
import { getMatchSync } from "../matchEventStore/syncService.js";
import { createOrReuseSmokeMatch } from "../smoke/smokeMatch.js";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { apiError } from "../errors/apiErrors.js";

export function registerMatchRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    requirePermission: (
      permission: "match.create"
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    requireMatchPermission: (
      permission:
        | "match.read"
        | "match.score.operate"
        | "match.correction.request"
        | "match.correction.apply"
        | "match.correction.reject",
      getMatchId: (request: FastifyRequest) => string
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    requireCsrf: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
) {
  app.post(
    "/api/v1/matches",
    {
      preHandler: [auth.requireAuth, auth.requirePermission("match.create"), auth.requireCsrf]
    },
    async (request, reply) => {
      const input = createMatchSchema.parse(request.body);
      const result = await createMatch({ pool, input });

      return reply.status(201).send(result);
    }
  );

  app.post(
    "/api/v1/matches/smoke",
    {
      preHandler: [auth.requireAuth, auth.requirePermission("match.create"), auth.requireCsrf]
    },
    async (request, reply) => {
      const user = request.user as AuthenticatedUser;

      if (user.role !== "ADMIN") {
        return reply.status(403).send(apiError(reasonCodes.FORBIDDEN, "Admin role is required"));
      }

      if (process.env.SMOKE_TEST_ENABLED !== "true") {
        return reply
          .status(403)
          .send(apiError(reasonCodes.FORBIDDEN, "Smoke match creation is disabled"));
      }

      const result = await createOrReuseSmokeMatch({ pool });

      return {
        ok: true,
        data: result
      };
    }
  );

  app.get<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/state",
    {
      preHandler: [
        auth.requireAuth,
        auth.requireMatchPermission("match.read", (request) => (request.params as { matchId: string }).matchId)
      ]
    },
    async (request) => {
      const connection = await pool.getConnection();

      try {
        return await getScoreboardProjection(connection, request.params.matchId);
      } finally {
        connection.release();
      }
    }
  );

  app.get<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/projection",
    {
      preHandler: [
        auth.requireAuth,
        auth.requireMatchPermission("match.read", (request) => (request.params as { matchId: string }).matchId)
      ]
    },
    async (request, reply) => {
      const connection = await pool.getConnection();

      try {
        const projection = await getScoreboardProjectionView(connection, request.params.matchId);

        if (!projection) {
          return reply.status(404).send(apiError(reasonCodes.MATCH_NOT_FOUND, "Match projection was not found"));
        }

        return projection;
      } finally {
        connection.release();
      }
    }
  );

  app.get<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/events",
    {
      preHandler: [
        auth.requireAuth,
        auth.requireMatchPermission("match.read", (request) => (request.params as { matchId: string }).matchId)
      ]
    },
    async (request) => {
      const connection = await pool.getConnection();

      try {
        return await listMatchEvents(connection, request.params.matchId);
      } finally {
        connection.release();
      }
    }
  );

  app.get<{ Params: { matchId: string }; Querystring: { lastEventSeq?: string } }>(
    "/api/v1/matches/:matchId/sync",
    {
      preHandler: [
        auth.requireAuth,
        auth.requireMatchPermission("match.read", (request) => (request.params as { matchId: string }).matchId)
      ]
    },
    async (request) => {
      const query = syncQuerySchema.parse(request.query);

      return getMatchSync({
        pool,
        matchId: request.params.matchId,
        lastEventSeq: query.lastEventSeq
      });
    }
  );

  app.get<{ Params: { matchId: string } }>(
    "/api/v1/public/matches/:matchId/scoreboard",
    async (request, reply) => {
      const connection = await pool.getConnection();

      try {
        const projection = await getScoreboardProjectionView(connection, request.params.matchId);

        if (!projection) {
          return reply.status(404).send(apiError(reasonCodes.MATCH_NOT_FOUND, "Match projection was not found"));
        }

        return projection;
      } catch (error) {
        request.log.error(
          {
            err: error,
            matchId: request.params.matchId,
            route: "GET /api/v1/public/matches/:matchId/scoreboard"
          },
          "Public scoreboard read failed"
        );
        return reply.status(500).send(apiError(reasonCodes.INTERNAL_ERROR, "Public scoreboard could not be loaded"));
      } finally {
        connection.release();
      }
    }
  );

  app.post<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/commands/score/add",
    {
      preHandler: [
        auth.requireAuth,
        auth.requireMatchPermission(
          "match.score.operate",
          (request) => (request.params as { matchId: string }).matchId
        ),
        auth.requireCsrf
      ]
    },
    async (request, reply) => {
      const command = addScoreCommandSchema.parse(request.body);

      if (command.matchId !== request.params.matchId) {
        return reply.send({
          status: "REJECTED",
          commandId: command.commandId,
          matchId: command.matchId,
          currentSeq: 0,
          appendedEvents: [],
          reasonCode: reasonCodes.MATCH_NOT_FOUND,
          message: "Path matchId does not match command envelope matchId"
        });
      }

      const result = await appendScoreAddedCommand({
        pool,
        command,
        user: request.user!
      });

      return reply.send(result);
    }
  );

  app.post<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/commands/foul/team/add",
    {
      preHandler: [
        auth.requireAuth,
        auth.requireMatchPermission(
          "match.score.operate",
          (request) => (request.params as { matchId: string }).matchId
        ),
        auth.requireCsrf
      ]
    },
    async (request, reply) => {
      const command = addTeamFoulCommandSchema.parse(request.body);

      if (command.matchId !== request.params.matchId) {
        return reply.send({
          status: "REJECTED",
          commandId: command.commandId,
          matchId: command.matchId,
          currentSeq: 0,
          appendedEvents: [],
          reasonCode: reasonCodes.MATCH_NOT_FOUND,
          message: "Path matchId does not match command envelope matchId"
        });
      }

      const result = await appendTeamFoulAddedCommand({
        pool,
        command,
        user: request.user!
      });

      return reply.send(result);
    }
  );

  app.post<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/commands/foul/player/add",
    {
      preHandler: [
        auth.requireAuth,
        auth.requireMatchPermission(
          "match.score.operate",
          (request) => (request.params as { matchId: string }).matchId
        ),
        auth.requireCsrf
      ]
    },
    async (request, reply) => {
      const command = addPlayerFoulCommandSchema.parse(request.body);

      if (command.matchId !== request.params.matchId) {
        return reply.send({
          status: "REJECTED",
          commandId: command.commandId,
          matchId: command.matchId,
          currentSeq: 0,
          appendedEvents: [],
          reasonCode: reasonCodes.MATCH_NOT_FOUND,
          message: "Path matchId does not match command envelope matchId"
        });
      }

      const result = await appendPlayerFoulAddedCommand({
        pool,
        command,
        user: request.user!
      });

      return reply.send(result);
    }
  );

  const clockPreHandlers = [
    auth.requireAuth,
    auth.requireMatchPermission(
      "match.score.operate",
      (request: FastifyRequest) => (request.params as { matchId: string }).matchId
    ),
    auth.requireCsrf
  ];

  app.post<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/commands/clock/game/start",
    { preHandler: clockPreHandlers },
    async (request, reply) => {
      const command = gameClockStartCommandSchema.parse(request.body);

      if (command.matchId !== request.params.matchId) {
        return reply.send(commandMatchIdMismatch(command));
      }

      return appendGameClockStartCommand({ pool, command, user: request.user! });
    }
  );

  app.post<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/commands/clock/game/stop",
    { preHandler: clockPreHandlers },
    async (request, reply) => {
      const command = gameClockStopCommandSchema.parse(request.body);

      if (command.matchId !== request.params.matchId) {
        return reply.send(commandMatchIdMismatch(command));
      }

      return appendGameClockStopCommand({ pool, command, user: request.user! });
    }
  );

  app.post<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/commands/clock/game/set",
    { preHandler: clockPreHandlers },
    async (request, reply) => {
      const command = gameClockSetCommandSchema.parse(request.body);

      if (command.matchId !== request.params.matchId) {
        return reply.send(commandMatchIdMismatch(command));
      }

      return appendGameClockSetCommand({ pool, command, user: request.user! });
    }
  );

  app.post<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/commands/clock/shot/reset",
    { preHandler: clockPreHandlers },
    async (request, reply) => {
      const command = shotClockResetCommandSchema.parse(request.body);

      if (command.matchId !== request.params.matchId) {
        return reply.send(commandMatchIdMismatch(command));
      }

      return appendShotClockResetCommand({ pool, command, user: request.user! });
    }
  );

  app.post<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/commands/clock/shot/set",
    { preHandler: clockPreHandlers },
    async (request, reply) => {
      const command = shotClockSetCommandSchema.parse(request.body);

      if (command.matchId !== request.params.matchId) {
        return reply.send(commandMatchIdMismatch(command));
      }

      return appendShotClockSetCommand({ pool, command, user: request.user! });
    }
  );

  app.post<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/commands/corrections/request",
    {
      preHandler: [
        auth.requireAuth,
        auth.requireMatchPermission(
          "match.correction.request",
          (request) => (request.params as { matchId: string }).matchId
        ),
        auth.requireCsrf
      ]
    },
    async (request, reply) => {
      const command = correctionRequestCommandSchema.parse(request.body);

      if (command.matchId !== request.params.matchId) {
        return reply.send({
          status: "REJECTED",
          commandId: command.commandId,
          matchId: command.matchId,
          currentSeq: 0,
          appendedEvents: [],
          reasonCode: reasonCodes.MATCH_NOT_FOUND,
          message: "Path matchId does not match command envelope matchId"
        });
      }

      const result = await requestScoreCorrection({
        pool,
        command,
        user: request.user!
      });

      return reply.send(result);
    }
  );

  app.post<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/commands/corrections/apply-score",
    {
      preHandler: [
        auth.requireAuth,
        auth.requireMatchPermission(
          "match.correction.apply",
          (request) => (request.params as { matchId: string }).matchId
        ),
        auth.requireCsrf
      ]
    },
    async (request, reply) => {
      const command = applyScoreCorrectionCommandSchema.parse(request.body);

      if (command.matchId !== request.params.matchId) {
        return reply.send({
          status: "REJECTED",
          commandId: command.commandId,
          matchId: command.matchId,
          currentSeq: 0,
          appendedEvents: [],
          reasonCode: reasonCodes.MATCH_NOT_FOUND,
          message: "Path matchId does not match command envelope matchId"
        });
      }

      const result = await applyScoreCorrection({
        pool,
        command,
        user: request.user!
      });

      return reply.send(result);
    }
  );

  app.post<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/commands/corrections/reject",
    {
      preHandler: [
        auth.requireAuth,
        auth.requireMatchPermission(
          "match.correction.reject",
          (request) => (request.params as { matchId: string }).matchId
        ),
        auth.requireCsrf
      ]
    },
    async (request, reply) => {
      const command = rejectCorrectionCommandSchema.parse(request.body);

      if (command.matchId !== request.params.matchId) {
        return reply.send({
          status: "REJECTED",
          commandId: command.commandId,
          matchId: command.matchId,
          currentSeq: 0,
          appendedEvents: [],
          reasonCode: reasonCodes.MATCH_NOT_FOUND,
          message: "Path matchId does not match command envelope matchId"
        });
      }

      const result = await rejectScoreCorrection({
        pool,
        command,
        user: request.user!
      });

      return reply.send(result);
    }
  );

  app.get<{ Params: { matchId: string } }>(
    "/api/v1/matches/:matchId/corrections",
    {
      preHandler: [
        auth.requireAuth,
        auth.requireMatchPermission("match.read", (request) => (request.params as { matchId: string }).matchId)
      ]
    },
    async (request) => {
      return listCorrectionsForMatch(pool, request.params.matchId);
    }
  );
}

function commandMatchIdMismatch(command: { commandId: string; matchId: string }) {
  return {
    status: "REJECTED",
    commandId: command.commandId,
    matchId: command.matchId,
    currentSeq: 0,
    appendedEvents: [],
    reasonCode: reasonCodes.MATCH_NOT_FOUND,
    message: "Path matchId does not match command envelope matchId"
  };
}
