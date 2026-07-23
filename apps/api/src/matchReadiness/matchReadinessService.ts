import type { Pool, RowDataPacket } from "mysql2/promise";
import type { MatchOfficialRoleCode, MatchOperationLinks, MatchReadiness } from "@basket-scoreboard/api-contracts";

type OfficialsRow = RowDataPacket & {
  match_id: string;
  role_code: MatchOfficialRoleCode | string;
  display_name: string | null;
};

type RosterRow = RowDataPacket & {
  match_id: string;
  team_side: "HOME" | "AWAY";
  player_count: number | string | null;
  starter_count: number | string | null;
};

type ConfirmationRow = RowDataPacket & {
  match_id: string;
  team_side: "HOME" | "AWAY";
};

type ReadinessSeed = {
  matchId: string;
  status: string;
};

type MatchSetupCounts = {
  officials: Array<{ role: MatchOfficialRoleCode | string; displayName: string | null }>;
  homeRosterCount: number;
  awayRosterCount: number;
  homeStarters: number;
  awayStarters: number;
  homeConfirmed: boolean;
  awayConfirmed: boolean;
};

export async function getReadinessForMatches(
  pool: Pool,
  matches: ReadinessSeed[]
): Promise<Map<string, MatchReadiness>> {
  if (matches.length === 0) {
    return new Map();
  }

  const matchIds = matches.map((match) => match.matchId);
  const counts = new Map<string, MatchSetupCounts>(
    matchIds.map((matchId) => [matchId, {
      officials: [],
      homeRosterCount: 0,
      awayRosterCount: 0,
      homeStarters: 0,
      awayStarters: 0,
      homeConfirmed: false,
      awayConfirmed: false
    }])
  );

  const [officialRows] = await pool.query<OfficialsRow[]>(
    `SELECT
      mo.match_id,
      mo.role_code,
      COALESCE(NULLIF(u.display_name, ''), u.email, mo.user_id) AS display_name
    FROM match_officials mo
    LEFT JOIN users u ON u.user_id = mo.user_id
    WHERE mo.match_id IN (?)
      AND mo.assignment_status = 'ACTIVE'
    ORDER BY mo.match_id ASC, mo.role_code ASC, display_name ASC`,
    [matchIds]
  );
  for (const row of officialRows) {
    const target = counts.get(row.match_id);
    if (target) {
      target.officials.push({
        role: row.role_code,
        displayName: labelOrNull(row.display_name)
      });
    }
  }

  const [rosterRows] = await pool.query<RosterRow[]>(
    "SELECT match_id, team_side, COUNT(*) AS player_count, SUM(CASE WHEN is_starter = 1 THEN 1 ELSE 0 END) AS starter_count FROM match_roster_players WHERE match_id IN (?) AND roster_status <> 'INACTIVE' GROUP BY match_id, team_side",
    [matchIds]
  );
  for (const row of rosterRows) {
    const target = counts.get(row.match_id);
    if (!target) {
      continue;
    }
    if (row.team_side === "HOME") {
      target.homeRosterCount = numberOrDefault(row.player_count, 0);
      target.homeStarters = numberOrDefault(row.starter_count, 0);
    } else {
      target.awayRosterCount = numberOrDefault(row.player_count, 0);
      target.awayStarters = numberOrDefault(row.starter_count, 0);
    }
  }

  const [confirmationRows] = await pool.query<ConfirmationRow[]>(
    "SELECT match_id, team_side FROM match_roster_confirmations WHERE match_id IN (?)",
    [matchIds]
  );
  for (const row of confirmationRows) {
    const target = counts.get(row.match_id);
    if (!target) {
      continue;
    }
    if (row.team_side === "HOME") {
      target.homeConfirmed = true;
    } else {
      target.awayConfirmed = true;
    }
  }

  return new Map(matches.map((match) => [
    match.matchId,
    buildReadiness(match.status, counts.get(match.matchId)!)
  ]));
}

export function buildMatchOperationLinks(matchId: string): MatchOperationLinks {
  const encoded = encodeURIComponent(matchId);
  return {
    operatorScoreUrl: `/operator/matches/${encoded}/score`,
    operatorFoulsUrl: `/operator/matches/${encoded}/fouls`,
    operatorClockUrl: `/operator/matches/${encoded}/clock`,
    operatorTimeoutsUrl: `/operator/matches/${encoded}/timeouts`,
    operatorLifecycleUrl: `/operator/matches/${encoded}/lifecycle`,
    officialsUrl: `/admin/matches/${encoded}/officials`,
    rostersUrl: `/admin/matches/${encoded}/rosters`,
    lineupUrl: `/admin/matches/${encoded}/lineup`,
    summaryUrl: `/operator/matches/${encoded}/summary`,
    replayUrl: `/operator/matches/${encoded}/replay`,
    auditLogUrl: `/operator/matches/${encoded}/audit-log`
  };
}

function buildReadiness(status: string, counts: MatchSetupCounts): MatchReadiness {
  const rosterState = counts.homeRosterCount > 0 && counts.awayRosterCount > 0
    ? "READY"
    : counts.homeRosterCount > 0 || counts.awayRosterCount > 0 ? "INCOMPLETE" : "MISSING";
  const hasLineupData = counts.homeStarters > 0
    || counts.awayStarters > 0
    || counts.homeConfirmed
    || counts.awayConfirmed;
  const lineupReady = counts.homeStarters === 5
    && counts.awayStarters === 5
    && counts.homeConfirmed
    && counts.awayConfirmed;

  const officials = buildOfficialsReadiness(counts.officials);

  return {
    officials,
    roster: {
      state: rosterState,
      homeCount: counts.homeRosterCount,
      awayCount: counts.awayRosterCount
    },
    lineup: {
      state: lineupReady ? "READY" : hasLineupData ? "INCOMPLETE" : "MISSING",
      homeStarters: counts.homeStarters,
      awayStarters: counts.awayStarters,
      homeConfirmed: counts.homeConfirmed,
      awayConfirmed: counts.awayConfirmed
    },
    lifecycle: buildLifecycleReadiness(status)
  };
}

function buildOfficialsReadiness(
  officials: Array<{ role: MatchOfficialRoleCode | string; displayName: string | null }>
): MatchReadiness["officials"] {
  const sortedOfficials = [...officials].sort((first, second) => {
    const roleComparison = String(first.role).localeCompare(String(second.role));
    if (roleComparison !== 0) {
      return roleComparison;
    }
    return (first.displayName ?? "").localeCompare(second.displayName ?? "");
  });

  if (officials.length === 0) {
    return {
      state: "MISSING",
      label: "No active officials",
      assignedCount: 0,
      roles: []
    };
  }

  const normalizedRoles = sortedOfficials.map((official) => String(official.role).toUpperCase());
  const alphaReady = normalizedRoles.some((role) => role === "SCORER" || role === "REFEREE");
  const roleList = Array.from(new Set(normalizedRoles)).sort();
  const baseLabel = `${sortedOfficials.length} active official${sortedOfficials.length === 1 ? "" : "s"}: ${roleList.join(", ")}`;

  return {
    state: alphaReady ? "READY" : "PARTIAL",
    label: alphaReady ? baseLabel : `${baseLabel}. Add scorer or referee for Alpha readiness.`,
    assignedCount: sortedOfficials.length,
    roles: sortedOfficials.map((official) => ({
      role: official.role,
      displayName: official.displayName
    }))
  };
}

function buildLifecycleReadiness(status: string): MatchReadiness["lifecycle"] {
  const normalized = status.toUpperCase();
  if (normalized === "SCHEDULED" || normalized === "READY") {
    return { state: "NOT_STARTED", label: "Not started" };
  }
  if (normalized === "LIVE" || normalized === "PERIOD_BREAK" || normalized === "TIMEOUT" || normalized === "OVERTIME") {
    return { state: "LIVE", label: "Live" };
  }
  if (normalized === "FINISHED" || normalized === "FINAL") {
    return { state: "FINISHED", label: "Finished" };
  }
  return { state: "UNKNOWN", label: "Unknown lifecycle state" };
}

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function labelOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
