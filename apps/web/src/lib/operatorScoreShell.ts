import type { UiCommandState, UiConnectionState } from "../components/ui";
import { getRealtimeConnectionLabel, type RealtimeConnectionState } from "./realtimeProjectionSync";

type ScoreMessage = {
  code?: string;
  text: string;
  tone: "success" | "error";
};

export function buildOperatorScoreConnection(
  realtimeState: RealtimeConnectionState,
  readOnly: boolean
): { label: string; state: UiConnectionState } {
  if (readOnly) {
    return { label: "Final match - read only", state: "read-only" };
  }

  const stateByRealtime: Record<RealtimeConnectionState, UiConnectionState> = {
    CONNECTED: "connected",
    RECONNECTING: "reconnecting",
    POLLING_FALLBACK: "reconnecting",
    UNAVAILABLE: "offline"
  };

  return {
    label: getRealtimeConnectionLabel(realtimeState),
    state: stateByRealtime[realtimeState]
  };
}

export function buildOperatorScoreCommandStatus(
  pendingKey: string | null,
  message: ScoreMessage | null
): { detail?: string; label?: string; state: UiCommandState } | undefined {
  if (pendingKey) {
    return { label: "Saving score", state: "pending" };
  }
  if (!message) return undefined;

  if (message.tone === "success") {
    return { detail: message.text, state: "accepted" };
  }

  const state = message.code === "INVALID_EXPECTED_SEQ" || message.code === "SYNC_REQUIRED"
    ? "sync-required"
    : "rejected";
  return { detail: message.text, state };
}
