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
  type ScoreboardProjection,
  type MatchReadiness
} from "@basket-scoreboard/api-contracts";
import { getScoreboardProjectionView } from "../matchEventStore/repositories.js";
import { toPublicScoreboardProjection } from "../publicScoreboard/publicScoreboardProjection.js";
import { resolvePublicMatchMetadata } from "../publicScoreboard/publicMatchMetadata.js";
import { loadAuthoritativeRosterBaseline } from "../rosters/rosterBaselineService.js";
import { serializePublicRosterBaseline } from "../rosters/rosterBaselinePublicSerializer.js";
import { getReadinessForMatches } from "../matchReadiness/matchReadinessService.js";

export type ProjectionRealtime = {
  emitProjectionUpdated: (projection: ScoreboardProjection) => Promise<void>;
  emitRosterBaselineUpdated: (payload: { matchId: string; teamSide: "HOME" | "AWAY"; protectedProjection: unknown; publicProjection?: unknown }) => Promise<void>;
};

export const noopProjectionRealtime: ProjectionRealtime = {
  emitProjectionUpdated: async () => undefined,
  emitRosterBaselineUpdated: async () => undefined
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
    socket.on("match:join", (rawPayload) => {
      void (async () => {
      const parsed = matchJoinPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        socket.emit("match:error", createRealtimeError({
          reasonCode: reasonCodes.VALIDATION_ERROR,
          message: "Invalid match join payload"
        }));
        return;
      }

      const payload = parsed.data;

      if (payload.view === "OPERATOR") {
        const response = await app.inject({
          method: "GET",
          url: `/api/v1/matches/${payload.matchId}/sync?lastEventSeq=${payload.lastSeq ?? 0}`,
          headers: operatorAuthHeaders(socket.handshake.headers)
        });
        if (response.statusCode !== 200) {
          socket.emit("match:error", createRealtimeError({
            reasonCode: response.statusCode === 404 ? reasonCodes.MATCH_NOT_FOUND : reasonCodes.FORBIDDEN,
            message: "Authenticated operator match access is required",
            matchId: payload.matchId
          }));
          return;
        }
        await socket.join(operatorMatchRoom(payload.matchId));
        socket.emit("match:operator-snapshot", response.json());
        await emitRosterBaselineSnapshots(socket, payload.matchId, "protected");
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
      await emitRosterBaselineSnapshots(socket, payload.matchId, "public");
      })().catch((error: unknown) => {
        app.log.warn({ err: error }, "Socket match join ended before mounted recovery completed");
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
    async emitProjectionUpdated(projection) {
      const matchMetadata = await resolveMetadataSafely(projection.matchId);
      const payload: PublicProjectionUpdatedPayload = {
        matchId: projection.matchId,
        updatedAt: projection.updatedAt ?? new Date().toISOString(),
        publicScoreboard: toPublicScoreboardProjection(projection, matchMetadata)
      };

      io.to(matchRoom(projection.matchId)).emit("projection.updated", payload);
    },
    async emitRosterBaselineUpdated(payload) {
      const readiness = (await getReadinessForMatches(pool, [{ matchId: payload.matchId, status: "SCHEDULED" }])).get(payload.matchId) ?? null;
      await emitAuthorizedOperatorUpdate(payload.matchId, "roster-baseline:protected-updated", { matchId: payload.matchId, teamSide: payload.teamSide, projection: payload.protectedProjection, readiness });
      const publicProjection = serializePublicRosterBaselineSafely(payload.protectedProjection);
      if (!publicProjection) {
        app.log.warn({ matchId: payload.matchId, teamSide: payload.teamSide }, "Refused to emit an invalid public roster baseline projection");
        return;
      }
      io.to(matchRoom(payload.matchId)).emit("roster-baseline:public-updated", { matchId: payload.matchId, teamSide: payload.teamSide, projection: publicProjection, readiness: toPublicReadiness(readiness) });
    }
  };

  async function emitRosterBaselineSnapshots(socket: { emit: (event: string, payload: unknown) => boolean }, matchId: string, view: "protected" | "public") {
    const connection = await pool.getConnection();
    try {
      const loaded = await Promise.all(([
        "HOME",
        "AWAY"
      ] as const).map(async (teamSide) => ({ teamSide, recovery: await loadAuthoritativeRosterBaseline(connection, matchId, teamSide) })));
      const available = loaded.filter((entry): entry is { teamSide: "HOME" | "AWAY"; recovery: NonNullable<typeof entry.recovery> } => entry.recovery !== null);
      const projections = available.map(({ recovery }) => view === "public" ? serializePublicRosterBaseline(recovery.projection) : recovery.projection);
      const recoveredTailEventSeqs = [...new Set(available.flatMap(({ recovery }) => recovery.tailEventSeqs))].sort((left, right) => left - right);
      const readiness = (await getReadinessForMatches(pool, [{ matchId, status: "SCHEDULED" }])).get(matchId) ?? null;
      socket.emit(
        `roster-baseline:${view}-snapshot`,
        view === "public"
          ? { matchId, projections, readiness: toPublicReadiness(readiness) }
          : { matchId, projections, readiness, recoveredTailEventSeqs }
      );
    } finally { connection.release(); }
  }

  function toPublicReadiness(readiness: MatchReadiness | null) {
    const baseline = readiness?.authoritativeBaseline;
    return {
      home: {
        status: baseline?.home.effective ? "READY" as const : "NOT_READY" as const,
        initialized: baseline?.home.initialized ?? false
      },
      away: {
        status: baseline?.away.effective ? "READY" as const : "NOT_READY" as const,
        initialized: baseline?.away.initialized ?? false
      }
    };
  }

  async function emitAuthorizedOperatorUpdate(matchId: string, event: string, payload: unknown) {
    const sockets = await io.in(operatorMatchRoom(matchId)).fetchSockets();
    await Promise.all(sockets.map(async (socket) => {
      const response = await app.inject({ method: "GET", url: `/api/v1/matches/${matchId}/sync?lastEventSeq=0`, headers: operatorAuthHeaders(socket.handshake.headers) });
      if (response.statusCode === 200 && await operatorAuthorized(matchId, socket.handshake.headers)) socket.emit(event, payload);
      else await socket.leave(operatorMatchRoom(matchId));
    }));
  }

  async function operatorAuthorized(matchId: string, headers: Record<string, string | string[] | undefined>) {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/matches/${matchId}/sync?lastEventSeq=0`,
      headers: operatorAuthHeaders(headers)
    });
    return response.statusCode === 200;
  }

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

export function operatorMatchRoom(matchId: string) {
  return `match:${matchId}:operator`;
}

function serializePublicRosterBaselineSafely(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const projection = value as Record<string, unknown>;
  if (
    (projection.teamSide !== "HOME" && projection.teamSide !== "AWAY")
    || typeof projection.matchId !== "string"
    || typeof projection.matchTeamId !== "string"
    || !Array.isArray(projection.members)
    || typeof projection.sourceRevision !== "string"
    || !projection.version
    || typeof projection.projectionIntegrityHash !== "string"
    || !projection.readiness
    || !projection.confirmation
  ) return null;

  try {
    return serializePublicRosterBaseline(value as Parameters<typeof serializePublicRosterBaseline>[0]);
  } catch {
    return null;
  }
}

function operatorAuthHeaders(headers: Record<string, string | string[] | undefined>) {
  const allowed = ["cookie", "x-dev-user-id", "x-dev-user-role", "x-dev-device-id", "x-dev-match-ids"] as const;
  return Object.fromEntries(allowed.flatMap((name) => {
    const value = headers[name];
    return typeof value === "string" ? [[name, value]] : [];
  }));
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
