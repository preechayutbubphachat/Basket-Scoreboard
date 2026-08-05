import type { MatchSummaryPlayer, MatchSummaryTeam } from "@basket-scoreboard/api-contracts";

export function getSummaryTeamTotals(team: MatchSummaryTeam) {
  return [
    { label: "Score", value: String(team.score) },
    { label: "Team fouls", value: String(team.teamFouls) },
    { label: "Timeouts", value: `${team.timeoutsUsed} used / ${team.timeoutsRemaining} remaining` },
    { label: "Unattributed points", value: String(team.unattributedPoints) }
  ];
}

export function buildSummaryPlayerLabels(player: Pick<MatchSummaryPlayer, "isStarter" | "isCaptain">) {
  const labels: string[] = [];
  if (player.isStarter) labels.push("STARTER");
  if (player.isCaptain) labels.push("CAPTAIN");
  return labels;
}

export function hasSummaryMutationControls() {
  return false;
}
