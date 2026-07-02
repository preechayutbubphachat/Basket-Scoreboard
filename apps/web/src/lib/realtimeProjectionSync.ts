import { io, type Socket } from "socket.io-client";
import type {
  MatchSnapshotPayload,
  ProjectionUpdatedPayload,
  ScoreboardProjection
} from "@basket-scoreboard/api-contracts";

export type RealtimeSocketTransport = "polling" | "websocket";
export type RealtimeConnectionState = "CONNECTED" | "RECONNECTING" | "UNAVAILABLE" | "POLLING_FALLBACK";

export type PublicProjectionSocket = Socket<{
  "match:snapshot": (payload: MatchSnapshotPayload) => void;
  "projection.updated": (payload: ProjectionUpdatedPayload) => void;
  "match:error": (payload: unknown) => void;
}, {
  "match:join": (payload: { matchId: string; lastSeq?: number; view: "PUBLIC_SCOREBOARD" }) => void;
}>;

export function applyRealtimeProjectionUpdate(
  current: ScoreboardProjection | null,
  incoming: ScoreboardProjection
) {
  if (!current) {
    return incoming;
  }

  const currentSeq = current.lastEventSeq ?? current.currentSeq;
  const incomingSeq = incoming.lastEventSeq ?? incoming.currentSeq;

  return incomingSeq >= currentSeq ? incoming : current;
}

export function shouldRefetchAfterRealtimeProjection(
  current: ScoreboardProjection | null,
  incoming: ScoreboardProjection
) {
  if (!current) {
    return false;
  }

  const currentSeq = current.lastEventSeq ?? current.currentSeq;
  const incomingSeq = incoming.lastEventSeq ?? incoming.currentSeq;

  return incomingSeq > currentSeq + 1;
}

export function parseRealtimeSocketTransports(rawValue: string | undefined): RealtimeSocketTransport[] {
  const allowed = new Set<RealtimeSocketTransport>(["polling", "websocket"]);
  const parsed = (rawValue ?? "")
    .split(",")
    .map((transport) => transport.trim())
    .filter((transport): transport is RealtimeSocketTransport => allowed.has(transport as RealtimeSocketTransport));

  return parsed.length > 0 ? parsed : ["polling", "websocket"];
}

export function getPublicPollingIntervalMs(state: RealtimeConnectionState) {
  return state === "CONNECTED"
    ? getNumberEnvValue(import.meta.env.VITE_POLLING_INTERVAL_PUBLIC_MS, 1000)
    : getNumberEnvValue(import.meta.env.VITE_POLLING_INTERVAL_PUBLIC_FAST_MS, 300);
}

export function getOperatorPollingIntervalMs(state: RealtimeConnectionState) {
  return state === "CONNECTED"
    ? getNumberEnvValue(import.meta.env.VITE_POLLING_INTERVAL_OPERATOR_MS, 500)
    : getNumberEnvValue(import.meta.env.VITE_POLLING_INTERVAL_OPERATOR_FAST_MS, 300);
}

export function getRealtimeConnectionLabel(state: RealtimeConnectionState) {
  switch (state) {
    case "CONNECTED":
      return "Realtime connected";
    case "RECONNECTING":
      return "Realtime reconnecting";
    case "UNAVAILABLE":
      return "Realtime unavailable";
    case "POLLING_FALLBACK":
      return "Polling fallback active";
  }
}

export function getSocketBaseUrl(apiBaseUrl: string) {
  if (!apiBaseUrl.startsWith("http://") && !apiBaseUrl.startsWith("https://")) {
    return undefined;
  }

  const url = new URL(apiBaseUrl);
  return url.origin;
}

export function createPublicProjectionSocket(apiBaseUrl: string): PublicProjectionSocket {
  return io(getSocketBaseUrl(apiBaseUrl), {
    path: "/socket.io",
    transports: parseRealtimeSocketTransports(import.meta.env.VITE_REALTIME_SOCKET_TRANSPORTS),
    withCredentials: true
  }) as PublicProjectionSocket;
}

function getNumberEnvValue(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
