import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { createApiClient } from "../../apps/web/src/lib/apiClient";
import {
  buildScoreQueuePresentation,
  createScoreIntent,
  initialScoreIntentQueueState,
  scoreIntentQueueReducer,
  type ScoreIntent
} from "../../apps/web/src/lib/scoreIntentQueue";

const appSource = readFileSync("apps/web/src/App.tsx", "utf8");
const workspaceSource = readFileSync("apps/web/src/components/ScoreWorkspace.tsx", "utf8");

function intent(id: string, teamSide: "HOME" | "AWAY", points: 1 | 2 | 3, playerId: string | null = null): ScoreIntent {
  return createScoreIntent({
    commandId: `00000000-0000-4000-8000-${id.padStart(12, "0")}`,
    correlationId: `10000000-0000-4000-8000-${id.padStart(12, "0")}`,
    localIntentId: `20000000-0000-4000-8000-${id.padStart(12, "0")}`,
    playerId,
    points,
    projection: { gameClockRemainingMs: 123000, periodNumber: 4 },
    teamSide
  });
}

describe("RM-05-P2 score intent queue", () => {
  test("preserves FIFO order for rapid same-team and cross-team activations", () => {
    const inputs = [intent("1", "HOME", 1), intent("2", "HOME", 2), intent("3", "AWAY", 3)];
    let state = inputs.reduce(
      (current, next) => scoreIntentQueueReducer(current, { type: "ENQUEUE", intent: next }),
      initialScoreIntentQueueState
    );
    const dispatched: string[] = [];
    while (state.queuedIntents.length > 0) {
      state = scoreIntentQueueReducer(state, { type: "START_NEXT" });
      dispatched.push(`${state.activeIntent?.teamSide}:${state.activeIntent?.points}`);
      state = scoreIntentQueueReducer(state, { type: "ACCEPT_ACTIVE" });
    }
    expect(dispatched).toEqual(["HOME:1", "HOME:2", "AWAY:3"]);
  });

  test("preserves multiple deliberate same-button intents with distinct identities", () => {
    const first = intent("1", "HOME", 1);
    const second = intent("2", "HOME", 1);
    let state = scoreIntentQueueReducer(initialScoreIntentQueueState, { type: "ENQUEUE", intent: first });
    state = scoreIntentQueueReducer(state, { type: "ENQUEUE", intent: second });
    expect(state.queuedIntents.map((item) => item.points)).toEqual([1, 1]);
    expect(new Set(state.queuedIntents.map((item) => item.commandId)).size).toBe(2);
  });

  test("snapshots player and command context but not expectedSeq", () => {
    const queued = intent("1", "AWAY", 2, "away-player-a");
    expect(queued).toMatchObject({
      teamSide: "AWAY",
      points: 2,
      playerId: "away-player-a",
      periodNumber: 4,
      gameClockRemainingMs: 123000
    });
    expect(queued).not.toHaveProperty("expectedSeq");
  });

  test("pauses on synchronization failure without losing queued intents or replaying active intent", () => {
    const active = intent("1", "HOME", 1);
    const waiting = intent("2", "AWAY", 3);
    let state = scoreIntentQueueReducer(initialScoreIntentQueueState, { type: "ENQUEUE", intent: active });
    state = scoreIntentQueueReducer(state, { type: "ENQUEUE", intent: waiting });
    state = scoreIntentQueueReducer(state, { type: "START_NEXT" });
    state = scoreIntentQueueReducer(state, { type: "PAUSE", reason: "SYNC_REQUIRED", detail: "Refresh complete" });
    expect(state.activeIntent?.commandId).toBe(active.commandId);
    expect(state.queuedIntents).toEqual([waiting]);
    expect(buildScoreQueuePresentation(state)).toMatchObject({ paused: true, queuedCount: 1, retryAvailable: false });
    const resumed = scoreIntentQueueReducer(state, { type: "RESUME_QUEUED" });
    expect(resumed.activeIntent).toBeNull();
    expect(resumed.queuedIntents).toEqual([waiting]);
  });

  test("ambiguous retry keeps the same logical and command identity", () => {
    const active = intent("1", "HOME", 2);
    let state = scoreIntentQueueReducer(initialScoreIntentQueueState, { type: "ENQUEUE", intent: active });
    state = scoreIntentQueueReducer(state, { type: "START_NEXT" });
    state = scoreIntentQueueReducer(state, { type: "PAUSE", reason: "NETWORK_AMBIGUOUS", detail: "Unknown" });
    const retried = scoreIntentQueueReducer(state, { type: "RETRY_ACTIVE" });
    expect(retried.activeIntent).toEqual(active);
    expect(retried.retryNonce).toBe(1);
    expect(retried.pauseReason).toBeNull();
  });

  test("discard deterministically clears active and queued work", () => {
    let state = scoreIntentQueueReducer(initialScoreIntentQueueState, { type: "ENQUEUE", intent: intent("1", "HOME", 1) });
    state = scoreIntentQueueReducer(state, { type: "START_NEXT" });
    state = scoreIntentQueueReducer(state, { type: "ENQUEUE", intent: intent("2", "AWAY", 1) });
    state = scoreIntentQueueReducer(state, { type: "DISCARD_ALL" });
    expect(state).toMatchObject({ activeIntent: null, queuedIntents: [], pauseReason: null });
  });

  test("api client reuses supplied identity without changing the score wire envelope", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify(
      (init?.method ?? "GET") === "GET"
        ? { ok: true, data: { csrfToken: "csrf" } }
        : { status: "ACCEPTED", commandId: "00000000-0000-4000-8000-000000000001", matchId: "match-1", currentSeq: 1, appendedEvents: [], reasonCode: null, message: null }
    ), { status: 200, headers: { "content-type": "application/json" } }));
    const api = createApiClient({ baseUrl: "/api/v1", fetchImpl });
    await api.ensureCsrfToken();
    fetchImpl.mockClear();
    const input = {
      commandId: "00000000-0000-4000-8000-000000000001",
      correlationId: "10000000-0000-4000-8000-000000000001",
      expectedSeq: 0,
      payload: { teamSide: "HOME" as const, points: 1 as const, playerId: null, periodNumber: 1, gameClockRemainingMs: 600000, note: null }
    };
    await api.addScore("match-1", input);
    await api.addScore("match-1", input);
    const bodies = fetchImpl.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies[0].commandId).toBe(input.commandId);
    expect(bodies[1].commandId).toBe(input.commandId);
    expect(bodies[0].correlationId).toBe(input.correlationId);
    expect(Object.keys(bodies[0]).sort()).toEqual(["clientTimestamp", "commandId", "correlationId", "expectedSeq", "matchId", "payload"]);
  });

  test("keeps queue, expectedSeq and dispatch ownership in OperatorScorePage", () => {
    const scoreSource = appSource.slice(appSource.indexOf("function OperatorScorePage"), appSource.indexOf("function OperatorFoulPage"));
    for (const signal of [
      "useReducer(scoreIntentQueueReducer",
      "const previousSeq = projection.currentSeq",
      "api.addScore(matchId",
      "dispatchScoreQueue({ type: \"START_NEXT\" })",
      "createClientCommandId()"
    ]) expect(scoreSource).toContain(signal);
    expect(workspaceSource).not.toMatch(/api\.|fetch\(|scoreIntentQueueReducer|createClientCommandId|expectedSeq/);
  });
});
