import type { FastifyInstance } from "fastify";
import type { Pool } from "mysql2/promise";
import { Server as SocketIoServer } from "socket.io";
import type { ServerOptions } from "socket.io";
import {
  matchJoinPayloadSchema,
  reasonCodes,
  type ProjectionUpdatedPayload,
  type RealtimeErrorPayload,
  type ScoreboardProjection
} from "@basket-scoreboard/api-contracts";
import { getScoreboardProjectionView } from "../matchEventStore/repositories.js";
import { toPublicScoreboardProjection } from "../publicScoreboard/publicScoreboardProjection.js";

export type ProjectionRealtime = {
  emitProjectionUpdated: (projection: ScoreboardProjection) => void;
};

export const noopProjectionRealtime: ProjectionRealtime = {
  emitProjectionUpdated: () => undefined
};

export function registerProjectionRealtime(app: FastifyInstance, pool: Pool): ProjectionRealtime {
  const io = new SocketIoServer(app.server, {
    cors: buildSocketCorsOptions(),
    path: "/socket.io",
    transports: parseRealtimeSocketTransports(process.env.REALTIME_SOCKET_TRANSPORTS)
  });

  app.addHook("onClose", async () => {
    await io.close();
  });

  io.on("connection", (socket) => {
    socket.on("match:join", async (rawPayload) => {
      const parsed = matchJoinPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        socket.emit("match:error", createRealtimeError({
          reasonCode: reasonCodes.VALIDATION_ERROR,
          message: "Invalid match join payload"
        }));
        return;
      }

      const payload = parsed.data;

      if (payload.view !== "PUBLIC_SCOREBOARD") {
        socket.emit("match:error", createRealtimeError({
          reasonCode: reasonCodes.FORBIDDEN,
          message: "Operator realtime rooms are not enabled in this slice",
          matchId: payload.matchId
        }));
        return;
      }

      const projection = await loadPublicProjection(pool, payload.matchId);
      if (!projection) {
        socket.emit("match:error", createRealtimeError({
          reasonCode: reasonCodes.MATCH_NOT_FOUND,
          message: "Match projection was not found",
          matchId: payload.matchId
        }));
        return;
      }

      await socket.join(matchRoom(payload.matchId));
      socket.emit("match:snapshot", {
        matchId: payload.matchId,
        lastEventSeq: projection.lastEventSeq ?? projection.currentSeq,
        publicScoreboard: toPublicScoreboardProjection(projection),
        serverTime: new Date().toISOString()
      });
    });

    socket.on("COMMAND_SUBMIT", () => {
      socket.emit("COMMAND_REJECTED", createRealtimeError({
        reasonCode: reasonCodes.FORBIDDEN,
        message: "Socket commands are disabled; use REST command endpoints"
      }));
    });
  });

  return {
    emitProjectionUpdated(projection) {
      const payload: ProjectionUpdatedPayload = {
        matchId: projection.matchId,
        lastEventSeq: projection.lastEventSeq ?? projection.currentSeq,
        updatedAt: projection.updatedAt ?? new Date().toISOString(),
        publicScoreboard: toPublicScoreboardProjection(projection)
      };

      io.to(matchRoom(projection.matchId)).emit("projection.updated", payload);
    }
  };
}

export function matchRoom(matchId: string) {
  return `match:${matchId}`;
}

export function parseRealtimeSocketTransports(rawValue: string | undefined): NonNullable<ServerOptions["transports"]> {
  const allowed = new Set(["polling", "websocket"] as const);
  const parsed = (rawValue ?? "")
    .split(",")
    .map((transport) => transport.trim())
    .filter((transport): transport is "polling" | "websocket" => allowed.has(transport as "polling" | "websocket"));

  return parsed.length > 0 ? parsed : ["polling", "websocket"];
}

async function loadPublicProjection(pool: Pool, matchId: string) {
  const connection = await pool.getConnection();

  try {
    return await getScoreboardProjectionView(connection, matchId);
  } finally {
    connection.release();
  }
}

function createRealtimeError(input: {
  reasonCode: string;
  message: string;
  matchId?: string;
}): RealtimeErrorPayload {
  return {
    ...input,
    serverTime: new Date().toISOString()
  };
}

function buildSocketCorsOptions() {
  const origins = (process.env.API_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const credentials = process.env.API_CORS_CREDENTIALS === "true";

  if (origins.length === 0) {
    return { credentials };
  }

  return {
    origin: origins,
    credentials
  };
}
