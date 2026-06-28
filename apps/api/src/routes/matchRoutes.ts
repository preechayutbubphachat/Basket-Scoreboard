import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "mysql2/promise";
import {
  addScoreCommandSchema,
  applyScoreCorrectionCommandSchema,
  correctionRequestCommandSchema,
  createMatchSchema,
  reasonCodes,
  rejectCorrectionCommandSchema,
  syncQuerySchema
} from "@basket-scoreboard/api-contracts";
import { appendScoreAddedCommand } from "../matchEventStore/appendScoreCommand.js";
import {
  applyScoreCorrection,
  listCorrectionsForMatch,
  rejectScoreCorrection,
  requestScoreCorrection
} from "../matchEventStore/correctionCommands.js";
import { createMatch } from "../matchEventStore/createMatch.js";
import { getScoreboardProjection, listMatchEvents } from "../matchEventStore/repositories.js";
import { getMatchSync } from "../matchEventStore/syncService.js";

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
        const projection = await getScoreboardProjection(connection, request.params.matchId);

        if (!projection) {
          return reply.status(404).send({ error: "MATCH_NOT_FOUND" });
        }

        return projection;
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
