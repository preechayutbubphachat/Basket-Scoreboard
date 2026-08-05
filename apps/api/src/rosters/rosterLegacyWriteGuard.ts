import type { PoolConnection, RowDataPacket } from "mysql2/promise";

export const ROSTER_BASELINE_INITIALIZED_EXPLICIT_COMMAND_REQUIRED = "ROSTER_BASELINE_INITIALIZED_EXPLICIT_COMMAND_REQUIRED" as const;

export type LegacyWriteGuardRejection = {
  ok: false;
  statusCode: 409;
  reasonCode: typeof ROSTER_BASELINE_INITIALIZED_EXPLICIT_COMMAND_REQUIRED;
  message: string;
};

type BaselineEventRow = RowDataPacket & { event_id: string };
type StreamRow = RowDataPacket & { last_seq_no: number };

/**
 * Must be called inside the caller's transaction before any legacy roster write.
 * The stream row lock serializes this check against baseline import.
 */
export async function rejectLegacyRosterWriteAfterBaseline(
  connection: PoolConnection,
  matchId: string,
  teamSide: "HOME" | "AWAY"
): Promise<LegacyWriteGuardRejection | null> {
  await connection.query<StreamRow[]>(
    "SELECT last_seq_no FROM match_streams WHERE match_id = ? FOR UPDATE",
    [matchId]
  );

  const [rows] = await connection.query<BaselineEventRow[]>(
    "SELECT event_id FROM match_events WHERE match_id = ? AND event_type = 'MATCH_ROSTER_BASELINE_IMPORTED' AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.teamSide')) = ? LIMIT 1",
    [matchId, teamSide]
  );

  if (!rows[0]) return null;

  return {
    ok: false,
    statusCode: 409,
    reasonCode: ROSTER_BASELINE_INITIALIZED_EXPLICIT_COMMAND_REQUIRED,
    message: "Legacy roster, lineup, captain and confirmation writes are disabled after authoritative roster baseline import"
  };
}
