import type { RosterBaselineProjection } from "./rosterBaselineProjection.js";

export type PublicRosterBaselineProjection = {
  teamSide: "HOME" | "AWAY";
  readiness: {
    status: "READY" | "NOT_READY";
  };
  initialized: boolean;
};

/**
 * Public roster baseline transport contract.
 * Keep this explicit allowlist in one boundary shared by REST and Socket.IO.
 */
export function serializePublicRosterBaseline(
  projection: RosterBaselineProjection
): PublicRosterBaselineProjection {
  return {
    teamSide: projection.teamSide,
    readiness: {
      status: projection.readiness.effective ? "READY" : "NOT_READY"
    },
    initialized: projection.version !== null
  };
}
