import { io, type Socket } from "socket.io-client";
import type {
  MatchSnapshotPayload,
  ProjectionUpdatedPayload,
  ScoreboardProjection
} from "@basket-scoreboard/api-contracts";

export type RealtimeConnectionState = "CONNECTED" | "RECONNECTING" | "POLLING_FALLBACK";

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

export function getRealtimeConnectionLabel(state: RealtimeConnectionState) {
  switch (state) {
    case "CONNECTED":
      return "Realtime connected";
    case "RECONNECTING":
      return "Realtime reconnecting";
    case "POLLING_FALLBACK":
      return "Polling fallback";
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
    transports: ["websocket", "polling"],
    withCredentials: true
  }) as PublicProjectionSocket;
}
