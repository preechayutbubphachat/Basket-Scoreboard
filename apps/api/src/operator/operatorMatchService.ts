import type { Pool, RowDataPacket } from "mysql2/promise";
import type { AuthenticatedUser, MatchOfficialRoleCode, OperatorMatchSummary } from "@basket-scoreboard/api-contracts";

type MatchRow = RowDataPacket & {
  match_id: string;
  match_code: string | null;
  home_team_id: string | null;
  home_team_name: string | null;
  away_team_id: string | null;
  away_team_name: string | null;
  status: string;
  scheduled_at: Date | string | null;
  venue_name: string | null;
  current_seq: number | string | null;
  assigned_role_codes: string | null;
};

export function canAccessOperatorMatches(user: AuthenticatedUser) {
  return user.role === "ADMIN" || user.role === "SCORER" || user.role === "REFEREE";
}

function serializeDate(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function serializeMatch(row: MatchRow): OperatorMatchSummary {
  return {
    matchId: row.match_id,
    matchCode: row.match_code,
    homeTeamId: row.home_team_id,
    homeTeamName: row.home_team_name,
    awayTeamId: row.away_team_id,
    awayTeamName: row.away_team_name,
    status: row.status,
    scheduledAt: serializeDate(row.scheduled_at),
    venueName: row.venue_name,
    assignedRoleCodes: row.assigned_role_codes
      ? (row.assigned_role_codes.split(",").filter(Boolean) as MatchOfficialRoleCode[])
      : [],
    currentSeq: Number(row.current_seq ?? 0)
  };
}

export async function listOperatorMatches(pool: Pool, user: AuthenticatedUser) {
  if (user.role === "ADMIN") {
    return listAdminMatches(pool);
  }

  const [rows] = await pool.query<MatchRow[]>(
    `
    SELECT
      m.match_id,
      m.match_code,
      m.home_team_id,
      home.name AS home_team_name,
      m.away_team_id,
      away.name AS away_team_name,
      m.status,
      m.scheduled_at,
      m.venue_name,
      COALESCE(ms.last_seq_no, 0) AS current_seq,
      GROUP_CONCAT(DISTINCT mo.role_code ORDER BY mo.role_code SEPARATOR ',') AS assigned_role_codes
    FROM match_officials mo
    INNER JOIN matches m ON m.match_id = mo.match_id
    LEFT JOIN teams home ON home.team_id = m.home_team_id
    LEFT JOIN teams away ON away.team_id = m.away_team_id
    LEFT JOIN match_streams ms ON ms.match_id = m.match_id
    WHERE mo.user_id = ?
      AND mo.assignment_status = 'ACTIVE'
    GROUP BY
      m.match_id,
      m.match_code,
      m.home_team_id,
      home.name,
      m.away_team_id,
      away.name,
      m.status,
      m.scheduled_at,
      m.venue_name,
      ms.last_seq_no
    ORDER BY m.scheduled_at IS NULL, m.scheduled_at ASC, m.created_at DESC
    `,
    [user.userId]
  );

  return rows.map(serializeMatch);
}

export async function listAdminMatches(pool: Pool) {
  const [rows] = await pool.query<MatchRow[]>(`
    SELECT
      m.match_id,
      m.match_code,
      m.home_team_id,
      home.name AS home_team_name,
      m.away_team_id,
      away.name AS away_team_name,
      m.status,
      m.scheduled_at,
      m.venue_name,
      COALESCE(ms.last_seq_no, 0) AS current_seq,
      GROUP_CONCAT(DISTINCT mo.role_code ORDER BY mo.role_code SEPARATOR ',') AS assigned_role_codes
    FROM matches m
    LEFT JOIN teams home ON home.team_id = m.home_team_id
    LEFT JOIN teams away ON away.team_id = m.away_team_id
    LEFT JOIN match_streams ms ON ms.match_id = m.match_id
    LEFT JOIN match_officials mo ON mo.match_id = m.match_id
      AND mo.assignment_status = 'ACTIVE'
    GROUP BY
      m.match_id,
      m.match_code,
      m.home_team_id,
      home.name,
      m.away_team_id,
      away.name,
      m.status,
      m.scheduled_at,
      m.venue_name,
      ms.last_seq_no
    ORDER BY m.scheduled_at IS NULL, m.scheduled_at ASC, m.created_at DESC
  `);

  return rows.map(serializeMatch);
}
