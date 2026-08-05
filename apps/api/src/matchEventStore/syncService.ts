import type { Pool } from "mysql2/promise";
import { getCurrentSeq, getScoreboardProjection, listMatchEvents } from "./repositories.js";
import { rebuildTimeoutOpportunityProjection } from "./replayService.js";
import { recoverRosterBaselineForMatch } from "../rosters/rosterBaselineRepository.js";

export async function getMatchSync(options: {
  pool: Pool;
  matchId: string;
  lastEventSeq: number;
}) {
  const connection = await options.pool.getConnection();

  try {
    const [currentSeq, projection, missedEvents, fullEventStream] = await Promise.all([
      getCurrentSeq(connection, options.matchId),
      getScoreboardProjection(connection, options.matchId),
      listMatchEvents(connection, options.matchId, options.lastEventSeq),
      listMatchEvents(connection, options.matchId, 0)
    ]);
    const rosterBaseline = await getProtectedRosterBaselineSync(connection, options.matchId);

    const replayed = projection
      ? rebuildTimeoutOpportunityProjection(options.matchId, fullEventStream)
      : null;
    const authoritativeProjection = projection && replayed
      ? {
          ...projection,
          timeoutOpportunity: replayed.timeoutOpportunity,
          timeoutOpportunityHistory: replayed.timeoutOpportunityHistory
        }
      : projection;

    return {
      matchId: options.matchId,
      currentSeq: currentSeq ?? 0,
      lastEventSeq: options.lastEventSeq,
      projection: authoritativeProjection,
      missedEvents,
      fullStateSyncRequired: false,
      serverTime: new Date().toISOString(),
      projectionVersion: "scoreboard-v1",
      connectionStatus: "ONLINE"
      ,rosterBaseline
    };
  } finally {
    connection.release();
  }
}

async function getProtectedRosterBaselineSync(connection: Awaited<ReturnType<Pool["getConnection"]>>, matchId: string) {
  const recovered = await Promise.all(([
    "HOME",
    "AWAY"
  ] as const).map(async (teamSide) => ({ teamSide, recovery: await recoverRosterBaselineForMatch(connection, matchId, teamSide) })));
  return recovered
    .filter((entry): entry is { teamSide: "HOME" | "AWAY"; recovery: NonNullable<typeof entry.recovery> } => entry.recovery !== null)
    .map(({ teamSide, recovery }) => ({ teamSide, projection: recovery.projection }));
}
