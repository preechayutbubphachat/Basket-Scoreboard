import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ScoreWorkspace } from "../../apps/web/src/components/ScoreWorkspace";
import { buildScoreControlPanels, type ScoreControlPoint, type ScoreControlTeamSide } from "../../apps/web/src/lib/scoreControl";
import "../../apps/web/src/styles/tokens.css";
import "../../apps/web/src/styles/primitives.css";
import "../../apps/web/src/styles/score-workspace.css";
import "../../apps/web/src/styles.css";

function Fixture() {
  const [selectedPlayers, setSelectedPlayers] = useState<Record<ScoreControlTeamSide, string>>({ HOME: "", AWAY: "" });
  const [dispatches, setDispatches] = useState<string[]>([]);
  const panels = buildScoreControlPanels({
    awayScore: 84,
    awayTeamName: "Phuket Sharks Academy",
    homeScore: 88,
    homeTeamName: "Bangkok Tigers Youth"
  }).map((panel) => ({
    ...panel,
    fouls: panel.teamSide === "HOME" ? 4 : 3,
    playerOptions: panel.teamSide === "HOME"
      ? [{ label: "#12 Kittipong", playerId: "home-player" }]
      : [{ label: "#9 Thanawat", playerId: "away-player" }],
    selectedPlayerId: selectedPlayers[panel.teamSide]
  }));

  function score(teamSide: ScoreControlTeamSide, points: ScoreControlPoint) {
    setDispatches((current) => [...current, `${teamSide}:${points}`]);
  }

  return (
    <main style={{ margin: "0 auto", maxWidth: 1560, padding: 16 }}>
      <ScoreWorkspace
        commandPending={false}
        connectionLabel="Realtime connected"
        controlsEnabled
        correctionEntry={{ href: "#corrections", onNavigate: () => undefined }}
        currentSeq={1284}
        matchStatus="LIVE"
        onPlayerChange={(teamSide, playerId) => setSelectedPlayers((current) => ({ ...current, [teamSide]: playerId }))}
        onScore={score}
        panels={panels}
        pendingKey={null}
        periodLabel="P4"
      />
      <output data-testid="dispatches">{dispatches.join(",")}</output>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
