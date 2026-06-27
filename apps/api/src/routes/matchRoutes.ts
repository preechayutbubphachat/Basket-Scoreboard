import type { FastifyInstance } from "fastify";
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
import { placeholderAuth, requireScorerOrAdmin } from "../auth/placeholderAuth";
import { appendScoreAddedCommand } from "../matchEventStore/appendScoreCommand";
import {
  applyScoreCorrection,
  listCorrectionsForMatch,
  rejectScoreCorrection,
  requestScoreCorrection
} from "../matchEventStore/correctionCommands";
import { createMatch } from "../matchEventStore/createMatch";
import { getScoreboardProjection, listMatchEvents } from "../matchEventStore/repositories";
import { getMatchSync } from "../matchEventStore/syncService";

export function registerMatchRoutes(app: FastifyInstance, pool: Pool) {
  app.post("/api/v1/matches", async (request, reply) => {
    const input = createMatchSchema.parse(request.body);
    const result = await createMatch({ pool, input });

    return reply.status(201).send(result);
  });

  app.get<{ Params: { matchId: string } }>("/api/v1/matches/:matchId/state", async (request) => {
    const connection = await pool.getConnection();

    try {
      return await getScoreboardProjection(connection, request.params.matchId);
    } finally {
      connection.release();
    }
  });

  app.get<{ Params: { matchId: string } }>("/api/v1/matches/:matchId/events", async (request) => {
    const connection = await pool.getConnection();

    try {
      return await listMatchEvents(connection, request.params.matchId);
    } finally {
      connection.release();
    }
  });

  app.get<{ Params: { matchId: string }; Querystring: { lastEventSeq?: string } }>(
    "/api/v1/matches/:matchId/sync",
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
      preHandler: [placeholderAuth, requireScorerOrAdmin]
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
      preHandler: [placeholderAuth, requireScorerOrAdmin]
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
      preHandler: [placeholderAuth, requireScorerOrAdmin]
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
      preHandler: [placeholderAuth, requireScorerOrAdmin]
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
      preHandler: [placeholderAuth, requireScorerOrAdmin]
    },
    async (request) => {
      return listCorrectionsForMatch(pool, request.params.matchId);
    }
  );
}
