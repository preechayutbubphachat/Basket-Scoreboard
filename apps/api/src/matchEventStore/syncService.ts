import type { Pool } from "mysql2/promise";
import { getCurrentSeq, getScoreboardProjection, listMatchEvents } from "./repositories.js";

export async function getMatchSync(options: {
  pool: Pool;
  matchId: string;
  lastEventSeq: number;
}) {
  const connection = await options.pool.getConnection();

  try {
    const [currentSeq, projection, missedEvents] = await Promise.all([
      getCurrentSeq(connection, options.matchId),
      getScoreboardProjection(connection, options.matchId),
      listMatchEvents(connection, options.matchId, options.lastEventSeq)
    ]);

    return {
      matchId: options.matchId,
      currentSeq: currentSeq ?? 0,
      lastEventSeq: options.lastEventSeq,
      projection,
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
