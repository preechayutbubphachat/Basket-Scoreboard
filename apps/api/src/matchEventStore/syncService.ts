import type { Pool } from "mysql2/promise";
import { getCurrentSeq, getScoreboardProjection, listMatchEvents } from "./repositories.js";
import { rebuildTimeoutOpportunityProjection } from "./replayService.js";

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
    };
  } finally {
    connection.release();
  }
}
