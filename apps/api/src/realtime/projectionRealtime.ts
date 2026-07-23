import type { FastifyInstance } from "fastify";
import type { Pool } from "mysql2/promise";
import { Server as SocketIoServer } from "socket.io";
import type { ServerOptions } from "socket.io";
import {
  matchJoinPayloadSchema,
  reasonCodes,
  type PublicMatchSnapshotPayload,
  type PublicProjectionUpdatedPayload,
  type RealtimeErrorPayload,
  type ScoreboardProjection
} from "@basket-scoreboard/api-contracts";
import { getScoreboardProjectionView } from "../matchEventStore/repositories.js";
import { toPublicScoreboardProjection } from "../publicScoreboard/publicScoreboardProjection.js";
import { resolvePublicMatchMetadata } from "../publicScoreboard/publicMatchMetadata.js";

export type ProjectionRealtime = {
  emitProjectionUpdated: (projection: ScoreboardProjection) => Promise<void>;
};

export const noopProjectionRealtime: ProjectionRealtime = {
  emitProjectionUpdated: async () => undefined
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

      const matchMetadata = await resolveMetadataSafely(payload.matchId);
      await socket.join(matchRoom(payload.matchId));
      const snapshot: PublicMatchSnapshotPayload = {
        matchId: payload.matchId,
        publicScoreboard: toPublicScoreboardProjection(projection, matchMetadata),
        serverTime: new Date().toISOString()
      };
      socket.emit("match:snapshot", snapshot);
    });

    socket.on("COMMAND_SUBMIT", () => {
      socket.emit("COMMAND_REJECTED", createRealtimeError({
        reasonCode: reasonCodes.FORBIDDEN,
        message: "Socket commands are disabled; use REST command endpoints"
      }));
    });
  });

  return {
    async emitProjectionUpdated(projection) {
      const matchMetadata = await resolveMetadataSafely(projection.matchId);
      const payload: PublicProjectionUpdatedPayload = {
        matchId: projection.matchId,
        updatedAt: projection.updatedAt ?? new Date().toISOString(),
        publicScoreboard: toPublicScoreboardProjection(projection, matchMetadata)
      };

      io.to(matchRoom(projection.matchId)).emit("projection.updated", payload);
    }
  };

  async function resolveMetadataSafely(matchId: string) {
    try {
      return await resolvePublicMatchMetadata(pool, matchId);
    } catch (error) {
      app.log.warn(
        { err: error, matchId },
        "Public match metadata could not be resolved; omitting optional metadata"
      );
      return undefined;
    }
  }
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
