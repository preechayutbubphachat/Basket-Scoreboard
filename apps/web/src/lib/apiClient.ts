import type {
  AuthenticatedUser,
  AlphaCorrectionResponse,
  ActiveDisplaySceneResponse,
  CommandResult,
  CorrectionEligibleEventsResponse,
  CreateCourtRequest,
  CreateDisplaySceneInput,
  CreateDisplayScreenInput,
  CreateTeamRequest,
  CreateTournamentMatchRequest,
  CreateTournamentRequest,
  CreateVenueRequest,
  CreatePlayerRequest,
  DisplaySceneResponse,
  DisplayScreenResponse,
  EffectiveMatchAccess,
  MatchDisplayOverrideInput,
  MatchDisplayOverrideResponse,
  MatchAssignment,
  MatchAuditLogResponse,
  MatchLineupResponse,
  MatchOfficialRoleCode,
  OfficialCandidate,
  MatchReplayResponse,
  MatchRosterPlayer,
  MatchRostersResponse,
  MatchSummaryResponse,
  MatchSyncResponse,
  OperatorMatchSummary,
  PlayerFoulAddedPayload,
  PlayerRecord,
  ReasonCode,
  ScoreAddedPayload,
  ScoreboardProjection,
  GameClockSetPayload,
  LifecycleCommandPayload,
  ShotClockResetPayload,
  ShotClockSetPayload,
  TeamDisplayProfileInput,
  TeamDisplayProfileResponse,
  TimeoutEndedPayload,
  TimeoutGrantedPayload,
  TournamentDisplayThemeInput,
  TournamentDisplayThemeResponse,
  TournamentLiveDashboardResponse,
  TournamentScheduleResponse,
  TournamentStandingsResponse,
  TournamentSetupTeam,
  TournamentSummary,
  PublicScoreboardProjection,
  PublicDisplayScreenResponse,
  UpdateDisplaySceneInput,
  UpdateDisplayScreenInput,
  VenueCourt,
  VenueListResponse,
  VenueSummary,
  TeamFoulAddedPayload,
  SmokeMatchResponse
} from "@basket-scoreboard/api-contracts";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type ApiErrorEnvelope = {
  error?:
    | string
    | {
        reasonCode?: ReasonCode | string;
        code?: ReasonCode | string;
        message?: string;
        details?: unknown;
      };
  reasonCode?: ReasonCode | string;
  code?: ReasonCode | string;
  message?: string;
  details?: unknown;
};

export type AssignmentRecord = MatchAssignment & {
  assignedByUserId?: string | null;
  revokedByUserId?: string | null;
  createdAt?: string;
  updatedAt?: string | null;
};

export class ApiClientError extends Error {
  reasonCode: string;
  status: number;
  details?: unknown;
  recoverable: boolean;

  constructor(input: {
    reasonCode: string;
    message: string;
    status: number;
    details?: unknown;
    recoverable?: boolean;
  }) {
    super(input.message);
    this.name = "ApiClientError";
    this.reasonCode = input.reasonCode;
    this.status = input.status;
    this.details = input.details;
    this.recoverable = input.recoverable ?? false;
  }
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function getDefaultApiBaseUrl() {
  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  return rawBaseUrl ? rawBaseUrl : "/api/v1";
}

export function buildApiUrl(baseUrl: string, path: string) {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

export function createApiRequestHeaders(input: {
  headers?: HeadersInit | undefined;
  body?: BodyInit | null | undefined;
  csrfToken?: string | null | undefined;
}) {
  const headers = new Headers(input.headers);

  if (input.body !== undefined && input.body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (input.csrfToken) {
    headers.set("x-csrf-token", input.csrfToken);
  }

  return Object.fromEntries(headers.entries());
}

export function createClientCommandId() {
  return globalThis.crypto?.randomUUID?.() ?? "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (digit) =>
    (Number(digit) ^ (Math.random() * 16) >> (Number(digit) / 4)).toString(16)
  );
}

export function createApiClient(options: { baseUrl?: string; fetchImpl?: FetchLike } = {}) {
  const baseUrl = options.baseUrl ?? getDefaultApiBaseUrl();
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  let csrfToken: string | null = null;

  const createCommandId = createClientCommandId;

  async function request<T>(
    path: string,
    init: RequestInit = {},
    retryingCsrf = false,
    options: { acceptRawSuccess?: boolean; skipCsrf?: boolean } = {}
  ): Promise<T> {
    const method = (init.method ?? "GET").toUpperCase();
    const isWrite = !["GET", "HEAD", "OPTIONS"].includes(method);
    if (isWrite && !csrfToken && !options.skipCsrf) {
      await ensureCsrfToken(false, init.signal ?? undefined);
    }
    const headers = createApiRequestHeaders({
      headers: init.headers,
      body: init.body,
      csrfToken
    });

    const response = await fetchImpl(buildApiUrl(baseUrl, path), {
      ...init,
      credentials: "include",
      headers
    });
    const payload = (await response.json().catch(() => ({}))) as ApiSuccess<T> | ApiErrorEnvelope;

    const isEnvelopeSuccess = "ok" in payload && payload.ok === true;
    if (response.ok && options.acceptRawSuccess && (!isEnvelopeSuccess || !("data" in payload))) {
      return payload as T;
    }

    if (!response.ok || !isEnvelopeSuccess) {
      const errorPayload = payload as ApiErrorEnvelope;
      const error = errorPayload.error;
      const fallbackReasonCode = errorPayload.reasonCode ?? errorPayload.code ?? `HTTP_${response.status}`;
      const reasonCode =
        typeof error === "string"
          ? errorPayload.reasonCode ?? errorPayload.code ?? error
          : error?.reasonCode ?? error?.code ?? fallbackReasonCode;
      const recoverable = reasonCode === "CSRF_REQUIRED" || reasonCode === "CSRF_INVALID";

      if (recoverable && !retryingCsrf) {
        csrfToken = null;
        await ensureCsrfToken(true, init.signal ?? undefined);
      }

      throw new ApiClientError({
        reasonCode,
        message:
          typeof error === "string"
            ? errorPayload.message ?? error
            : error?.message ?? errorPayload.message ?? "Request failed",
        status: response.status,
        details: typeof error === "string" ? errorPayload.details : error?.details ?? errorPayload.details,
        recoverable
      });
    }

    return payload.data;
  }

  async function ensureCsrfToken(force = false, signal?: AbortSignal) {
    if (csrfToken && !force) {
      return csrfToken;
    }
    const data = await request<{ csrfToken: string }>(
      "/auth/csrf",
      signal ? { method: "GET", signal } : { method: "GET" },
      true
    );
    csrfToken = data.csrfToken;
    return csrfToken;
  }

  return {
    get csrfToken() {
      return csrfToken;
    },
    async login(input: { email: string; password: string }) {
      const data = await request<{ user: AuthenticatedUser; csrfToken?: string }>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify(input)
        },
        false,
        { skipCsrf: true }
      );
      csrfToken = data.csrfToken ?? (await ensureCsrfToken(true));
      return { ...data, csrfToken };
    },
    async getCurrentUser() {
      const data = await request<{ user: AuthenticatedUser }>("/auth/me");
      return data.user;
    },
    ensureCsrfToken,
    async logout() {
      const data = await request<{ loggedOut: boolean }>("/auth/logout", { method: "POST" });
      csrfToken = null;
      return data;
    },
    async listOfficials(matchId: string) {
      const data = await request<{ officials: AssignmentRecord[] }>(`/matches/${encodeURIComponent(matchId)}/officials`);
      return data.officials;
    },
    async listOfficialCandidates() {
      const data = await request<{ candidates: OfficialCandidate[] }>("/users/official-candidates");
      return data.candidates;
    },
    async getOperatorMatches() {
      const data = await request<{ matches: OperatorMatchSummary[] }>("/operator/matches");
      return data.matches;
    },
    async getAdminMatches() {
      const data = await request<{ matches: OperatorMatchSummary[] }>("/matches");
      return data.matches;
    },
    async getTournaments() {
      const data = await request<{ tournaments: TournamentSummary[] }>("/tournaments");
      return data.tournaments;
    },
    async createTournament(input: CreateTournamentRequest) {
      const data = await request<{ tournament: TournamentSummary }>("/tournaments", {
        method: "POST",
        body: JSON.stringify(input)
      });
      return data.tournament;
    },
    async listTeams() {
      const data = await request<{ teams: TournamentSetupTeam[] }>("/teams");
      return data.teams;
    },
    async createTeam(input: CreateTeamRequest) {
      const data = await request<{ team: TournamentSetupTeam }>("/teams", {
        method: "POST",
        body: JSON.stringify(input)
      });
      return data.team;
    },
    async getVenues() {
      const data = await request<VenueListResponse>("/venues");
      return data.venues;
    },
    async createVenue(input: CreateVenueRequest) {
      const data = await request<{ venue: VenueSummary }>("/venues", {
        method: "POST",
        body: JSON.stringify(input)
      });
      return data.venue;
    },
    async createCourt(venueId: string, input: CreateCourtRequest) {
      const data = await request<{ court: VenueCourt }>(`/venues/${encodeURIComponent(venueId)}/courts`, {
        method: "POST",
        body: JSON.stringify(input)
      });
      return data.court;
    },
    async createTournamentMatch(tournamentId: string, input: CreateTournamentMatchRequest) {
      const data = await request<{
        matchId: string;
        currentSeq: number;
        scheduleMatch: TournamentScheduleResponse["matches"][number];
      }>(`/tournaments/${encodeURIComponent(tournamentId)}/matches`, {
        method: "POST",
        body: JSON.stringify(input)
      });
      return data;
    },
    async getTournamentSchedule(tournamentId: string) {
      const data = await request<TournamentScheduleResponse>(`/tournaments/${encodeURIComponent(tournamentId)}/schedule`);
      return data;
    },
    async getTournamentLiveDashboard(tournamentId: string) {
      const data = await request<TournamentLiveDashboardResponse>(
        `/tournaments/${encodeURIComponent(tournamentId)}/live-dashboard`
      );
      return data;
    },
    async getTournamentStandings(tournamentId: string) {
      const data = await request<TournamentStandingsResponse>(
        `/tournaments/${encodeURIComponent(tournamentId)}/standings`
      );
      return data;
    },
    async getTournamentDisplayTheme(tournamentId: string) {
      const data = await request<{ theme: TournamentDisplayThemeResponse }>(
        `/tournaments/${encodeURIComponent(tournamentId)}/display-theme`
      );
      return data.theme;
    },
    async saveTournamentDisplayTheme(tournamentId: string, input: TournamentDisplayThemeInput) {
      const data = await request<{ theme: TournamentDisplayThemeResponse }>(
        `/tournaments/${encodeURIComponent(tournamentId)}/display-theme`,
        {
          method: "PUT",
          body: JSON.stringify(input)
        }
      );
      return data.theme;
    },
    async getTeamDisplayProfile(teamId: string) {
      const data = await request<{ profile: TeamDisplayProfileResponse }>(
        `/teams/${encodeURIComponent(teamId)}/display-profile`
      );
      return data.profile;
    },
    async saveTeamDisplayProfile(teamId: string, input: TeamDisplayProfileInput) {
      const data = await request<{ profile: TeamDisplayProfileResponse }>(
        `/teams/${encodeURIComponent(teamId)}/display-profile`,
        {
          method: "PUT",
          body: JSON.stringify(input)
        }
      );
      return data.profile;
    },
    async getMatchDisplayOverride(matchId: string) {
      const data = await request<{ override: MatchDisplayOverrideResponse }>(
        `/matches/${encodeURIComponent(matchId)}/display-override`
      );
      return data.override;
    },
    async saveMatchDisplayOverride(matchId: string, input: MatchDisplayOverrideInput) {
      const data = await request<{ override: MatchDisplayOverrideResponse }>(
        `/matches/${encodeURIComponent(matchId)}/display-override`,
        {
          method: "PUT",
          body: JSON.stringify(input)
        }
      );
      return data.override;
    },
    async listDisplayScreens() {
      const data = await request<{ screens: DisplayScreenResponse[] }>("/display-screens");
      return data.screens;
    },
    async createDisplayScreen(input: CreateDisplayScreenInput) {
      const data = await request<{ screen: DisplayScreenResponse }>("/display-screens", {
        method: "POST",
        body: JSON.stringify(input)
      });
      return data.screen;
    },
    async getDisplayScreen(screenId: string) {
      const data = await request<{ screen: DisplayScreenResponse }>(`/display-screens/${encodeURIComponent(screenId)}`);
      return data.screen;
    },
    async updateDisplayScreen(screenId: string, input: UpdateDisplayScreenInput) {
      const data = await request<{ screen: DisplayScreenResponse }>(
        `/display-screens/${encodeURIComponent(screenId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(input)
        }
      );
      return data.screen;
    },
    async listDisplayScenes(screenId: string) {
      const data = await request<{ scenes: DisplaySceneResponse[] }>(
        `/display-screens/${encodeURIComponent(screenId)}/scenes`
      );
      return data.scenes;
    },
    async createDisplayScene(screenId: string, input: CreateDisplaySceneInput) {
      const data = await request<{ scene: DisplaySceneResponse }>(
        `/display-screens/${encodeURIComponent(screenId)}/scenes`,
        {
          method: "POST",
          body: JSON.stringify(input)
        }
      );
      return data.scene;
    },
    async updateDisplayScene(screenId: string, sceneId: string, input: UpdateDisplaySceneInput) {
      const data = await request<{ scene: DisplaySceneResponse }>(
        `/display-screens/${encodeURIComponent(screenId)}/scenes/${encodeURIComponent(sceneId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(input)
        }
      );
      return data.scene;
    },
    async setActiveDisplayScene(screenId: string, sceneId: string) {
      const data = await request<{ activeScene: ActiveDisplaySceneResponse }>(
        `/display-screens/${encodeURIComponent(screenId)}/active-scene`,
        {
          method: "POST",
          body: JSON.stringify({ sceneId })
        }
      );
      return data.activeScene;
    },
    async getPublicDisplayScreen(screenSlug: string) {
      const data = await request<PublicDisplayScreenResponse["data"]>(`/public/display/${encodeURIComponent(screenSlug)}`);
      return data;
    },
    async getPublicTournaments() {
      const data = await request<{ tournaments: TournamentSummary[] }>("/public/tournaments");
      return data.tournaments;
    },
    async getPublicTournamentSchedule(tournamentId: string) {
      const data = await request<TournamentScheduleResponse>(
        `/public/tournaments/${encodeURIComponent(tournamentId)}/schedule`
      );
      return data;
    },
    async getPublicTournamentStandings(tournamentId: string) {
      const data = await request<TournamentStandingsResponse>(
        `/public/tournaments/${encodeURIComponent(tournamentId)}/standings`
      );
      return data;
    },
    async createSmokeMatch() {
      const data = await request<SmokeMatchResponse>("/matches/smoke", { method: "POST" });
      return data;
    },
    async listTeamPlayers(teamId: string) {
      const data = await request<{ players: PlayerRecord[] }>(`/teams/${encodeURIComponent(teamId)}/players`);
      return data.players;
    },
    async createPlayer(teamId: string, input: CreatePlayerRequest) {
      const data = await request<{ player: PlayerRecord }>(`/teams/${encodeURIComponent(teamId)}/players`, {
        method: "POST",
        body: JSON.stringify(input)
      });
      return data.player;
    },
    async getMatchRosters(matchId: string, signal?: AbortSignal) {
      return request<MatchRostersResponse>(
        `/matches/${encodeURIComponent(matchId)}/rosters`,
        signal ? { signal } : {},
        false,
        { acceptRawSuccess: false }
      );
    },
    async getMatchLineup(matchId: string) {
      const data = await request<MatchLineupResponse>(
        `/matches/${encodeURIComponent(matchId)}/lineup`
      );
      return data;
    },
    async selectLineupStarter(matchId: string, teamSide: "HOME" | "AWAY", playerId: string, reason: string | null = null) {
      return lineupMutation(matchId, `/lineup/${teamSide}/starters/${encodeURIComponent(playerId)}`, reason);
    },
    async removeLineupStarter(matchId: string, teamSide: "HOME" | "AWAY", playerId: string, reason: string | null = null) {
      return lineupMutation(matchId, `/lineup/${teamSide}/starters/${encodeURIComponent(playerId)}/remove`, reason);
    },
    async setLineupCaptain(matchId: string, teamSide: "HOME" | "AWAY", playerId: string, reason: string | null = null) {
      return lineupMutation(matchId, `/lineup/${teamSide}/captain/${encodeURIComponent(playerId)}`, reason);
    },
    async confirmLineupRoster(matchId: string, teamSide: "HOME" | "AWAY", reason: string | null = null) {
      return lineupMutation(matchId, `/lineup/${teamSide}/confirm`, reason);
    },
    async assignRosterPlayer(matchId: string, teamSide: "HOME" | "AWAY", playerId: string) {
      const data = await request<{ rosterPlayer: MatchRosterPlayer }>(
        `/matches/${encodeURIComponent(matchId)}/rosters/${teamSide}/players`,
        {
          method: "POST",
          body: JSON.stringify({ playerId })
        }
      );
      return data.rosterPlayer;
    },
    async getMatchState(matchId: string) {
      return request<ScoreboardProjection | null>(
        `/matches/${encodeURIComponent(matchId)}/state`,
        {},
        false,
        { acceptRawSuccess: true }
      );
    },
    async getMatchProjection(matchId: string, signal?: AbortSignal) {
      return request<ScoreboardProjection>(
        `/matches/${encodeURIComponent(matchId)}/projection`,
        signal ? { signal } : {},
        false,
        { acceptRawSuccess: true }
      );
    },
    async getEffectiveMatchAccess(matchId: string, signal?: AbortSignal) {
      return request<EffectiveMatchAccess>(
        `/matches/${encodeURIComponent(matchId)}/effective-access`,
        signal ? { signal } : {}
      );
    },
    async getMatchSummary(matchId: string) {
      return request<MatchSummaryResponse>(
        `/matches/${encodeURIComponent(matchId)}/summary`,
        {},
        false,
        { acceptRawSuccess: true }
      );
    },
    async getMatchReplay(
      matchId: string,
      options: { group?: string; limit?: number; afterSeq?: number; beforeSeq?: number } = {}
    ) {
      const params = new URLSearchParams();
      if (options.group) params.set("group", options.group);
      if (options.limit !== undefined) params.set("limit", String(options.limit));
      if (options.afterSeq !== undefined) params.set("afterSeq", String(options.afterSeq));
      if (options.beforeSeq !== undefined) params.set("beforeSeq", String(options.beforeSeq));
      const query = params.toString();
      return request<MatchReplayResponse>(
        `/matches/${encodeURIComponent(matchId)}/replay${query ? `?${query}` : ""}`,
        {},
        false,
        { acceptRawSuccess: true }
      );
    },
    async getMatchAuditLog(
      matchId: string,
      options: {
        group?: string;
        limit?: number;
        afterSeq?: number;
        beforeSeq?: number;
        actorId?: string;
        eventType?: string;
        hasReason?: boolean;
      } = {}
    ) {
      const params = new URLSearchParams();
      if (options.group) params.set("group", options.group);
      if (options.limit !== undefined) params.set("limit", String(options.limit));
      if (options.afterSeq !== undefined) params.set("afterSeq", String(options.afterSeq));
      if (options.beforeSeq !== undefined) params.set("beforeSeq", String(options.beforeSeq));
      if (options.actorId) params.set("actorId", options.actorId);
      if (options.eventType) params.set("eventType", options.eventType);
      if (options.hasReason !== undefined) params.set("hasReason", String(options.hasReason));
      const query = params.toString();
      return request<MatchAuditLogResponse>(
        `/matches/${encodeURIComponent(matchId)}/audit-log${query ? `?${query}` : ""}`,
        { method: "GET" },
        false,
        { acceptRawSuccess: true }
      );
    },
    async getEligibleCorrectionEvents(matchId: string, options: { limit?: number; eventTypes?: string[] } = {}) {
      const params = new URLSearchParams();
      if (options.limit !== undefined) params.set("limit", String(options.limit));
      if (options.eventTypes?.length) params.set("eventTypes", options.eventTypes.join(","));
      const query = params.toString();
      return request<CorrectionEligibleEventsResponse>(
        `/matches/${encodeURIComponent(matchId)}/corrections/eligible-events${query ? `?${query}` : ""}`,
        { method: "GET" },
        false,
        { acceptRawSuccess: true }
      );
    },
    async applyAlphaCorrection(
      matchId: string,
      input: {
        expectedSeq: number;
        correctedEventSeq: number;
        correctionKind: string;
        reason: string;
        payload: Record<string, unknown>;
      }
    ) {
      return request<AlphaCorrectionResponse | CommandResult>(
        `/matches/${encodeURIComponent(matchId)}/corrections`,
        {
          method: "POST",
          body: JSON.stringify({
            commandId: createCommandId(),
            matchId,
            expectedSeq: input.expectedSeq,
            correlationId: createCommandId(),
            clientTimestamp: new Date().toISOString(),
            correctedEventSeq: input.correctedEventSeq,
            correctionKind: input.correctionKind,
            reason: input.reason,
            payload: input.payload
          })
        },
        false,
        { acceptRawSuccess: true }
      );
    },
    async syncMatch(matchId: string, lastEventSeq: number, signal?: AbortSignal) {
      return request<MatchSyncResponse>(
        `/matches/${encodeURIComponent(matchId)}/sync?lastEventSeq=${encodeURIComponent(String(lastEventSeq))}`,
        signal ? { signal } : {},
        false,
        { acceptRawSuccess: true }
      );
    },
    async addScore(matchId: string, input: {
      commandId?: string;
      correlationId?: string;
      expectedSeq: number;
      payload: ScoreAddedPayload;
    }) {
      return request<CommandResult>(
        `/matches/${encodeURIComponent(matchId)}/commands/score/add`,
        {
          method: "POST",
          body: JSON.stringify({
            commandId: input.commandId ?? createCommandId(),
            matchId,
            expectedSeq: input.expectedSeq,
            correlationId: input.correlationId ?? createCommandId(),
            clientTimestamp: new Date().toISOString(),
            payload: input.payload
          })
        },
        false,
        { acceptRawSuccess: true }
      );
    },
    async addTeamFoul(matchId: string, input: { expectedSeq: number; payload: TeamFoulAddedPayload }) {
      return request<CommandResult>(
        `/matches/${encodeURIComponent(matchId)}/commands/foul/team/add`,
        {
          method: "POST",
          body: JSON.stringify({
            commandId: createCommandId(),
            matchId,
            expectedSeq: input.expectedSeq,
            correlationId: createCommandId(),
            clientTimestamp: new Date().toISOString(),
            payload: input.payload
          })
        },
        false,
        { acceptRawSuccess: true }
      );
    },
    async addPlayerFoul(matchId: string, input: {
      commandId?: string;
      correlationId?: string;
      expectedSeq: number;
      clientTimestamp?: string;
      payload: PlayerFoulAddedPayload;
      signal?: AbortSignal;
    }) {
      return request<CommandResult>(
        `/matches/${encodeURIComponent(matchId)}/commands/foul/player/add`,
        {
          method: "POST",
          ...(input.signal ? { signal: input.signal } : {}),
          body: JSON.stringify({
            commandId: input.commandId ?? createCommandId(),
            matchId,
            expectedSeq: input.expectedSeq,
            correlationId: input.correlationId ?? createCommandId(),
            clientTimestamp: input.clientTimestamp ?? new Date().toISOString(),
            payload: input.payload
          })
        },
        false,
        { acceptRawSuccess: true }
      );
    },
    async startGameClock(matchId: string, input: { expectedSeq: number }) {
      return request<CommandResult>(
        `/matches/${encodeURIComponent(matchId)}/commands/clock/game/start`,
        {
          method: "POST",
          body: JSON.stringify(createCommandEnvelope(matchId, input.expectedSeq, {}))
        },
        false,
        { acceptRawSuccess: true }
      );
    },
    async stopGameClock(matchId: string, input: { expectedSeq: number }) {
      return request<CommandResult>(
        `/matches/${encodeURIComponent(matchId)}/commands/clock/game/stop`,
        {
          method: "POST",
          body: JSON.stringify(createCommandEnvelope(matchId, input.expectedSeq, {}))
        },
        false,
        { acceptRawSuccess: true }
      );
    },
    async setGameClock(matchId: string, input: { expectedSeq: number; payload: GameClockSetPayload }) {
      return request<CommandResult>(
        `/matches/${encodeURIComponent(matchId)}/commands/clock/game/set`,
        {
          method: "POST",
          body: JSON.stringify(createCommandEnvelope(matchId, input.expectedSeq, input.payload))
        },
        false,
        { acceptRawSuccess: true }
      );
    },
    async resetShotClock(matchId: string, input: { expectedSeq: number; payload: ShotClockResetPayload }) {
      return request<CommandResult>(
        `/matches/${encodeURIComponent(matchId)}/commands/clock/shot/reset`,
        {
          method: "POST",
          body: JSON.stringify(createCommandEnvelope(matchId, input.expectedSeq, input.payload))
        },
        false,
        { acceptRawSuccess: true }
      );
    },
    async setShotClock(matchId: string, input: { expectedSeq: number; payload: ShotClockSetPayload }) {
      return request<CommandResult>(
        `/matches/${encodeURIComponent(matchId)}/commands/clock/shot/set`,
        {
          method: "POST",
          body: JSON.stringify(createCommandEnvelope(matchId, input.expectedSeq, input.payload))
        },
        false,
        { acceptRawSuccess: true }
      );
    },
    async grantTimeout(matchId: string, input: { expectedSeq: number; payload: TimeoutGrantedPayload }) {
      return request<CommandResult>(
        `/matches/${encodeURIComponent(matchId)}/commands/timeout/grant`,
        {
          method: "POST",
          body: JSON.stringify(createCommandEnvelope(matchId, input.expectedSeq, input.payload))
        },
        false,
        { acceptRawSuccess: true }
      );
    },
    async endTimeout(matchId: string, input: { expectedSeq: number; payload: TimeoutEndedPayload }) {
      return request<CommandResult>(
        `/matches/${encodeURIComponent(matchId)}/commands/timeout/end`,
        {
          method: "POST",
          body: JSON.stringify(createCommandEnvelope(matchId, input.expectedSeq, input.payload))
        },
        false,
        { acceptRawSuccess: true }
      );
    },
    async startMatch(matchId: string, input: { expectedSeq: number; payload: LifecycleCommandPayload }) {
      return lifecycleCommand("/commands/lifecycle/start-match", matchId, input);
    },
    async endPeriod(matchId: string, input: { expectedSeq: number; payload: LifecycleCommandPayload }) {
      return lifecycleCommand("/commands/lifecycle/end-period", matchId, input);
    },
    async startNextPeriod(matchId: string, input: { expectedSeq: number; payload: LifecycleCommandPayload }) {
      return lifecycleCommand("/commands/lifecycle/start-next-period", matchId, input);
    },
    async startOvertime(matchId: string, input: { expectedSeq: number; payload: LifecycleCommandPayload }) {
      return lifecycleCommand("/commands/lifecycle/start-overtime", matchId, input);
    },
    async finishMatch(matchId: string, input: { expectedSeq: number; payload: LifecycleCommandPayload }) {
      return lifecycleCommand("/commands/lifecycle/finish-match", matchId, input);
    },
    async getPublicScoreboard(matchId: string) {
      return request<PublicScoreboardProjection>(
        `/public/matches/${encodeURIComponent(matchId)}/scoreboard`,
        {},
        false,
        { acceptRawSuccess: true }
      );
    },
    async assignOfficial(matchId: string, input: { userId: string; roleCode: MatchOfficialRoleCode }) {
      const data = await request<{ assignment: AssignmentRecord }>(`/matches/${encodeURIComponent(matchId)}/officials`, {
        method: "POST",
        body: JSON.stringify(input)
      });
      return data.assignment;
    },
    async revokeOfficial(matchId: string, assignmentId: string, reason: string) {
      const data = await request<{ assignment: AssignmentRecord }>(
        `/matches/${encodeURIComponent(matchId)}/officials/${encodeURIComponent(assignmentId)}`,
        {
          method: "DELETE",
          body: JSON.stringify({ reason })
        }
      );
      return data.assignment;
    }
  };

  function createCommandEnvelope(matchId: string, expectedSeq: number, payload: unknown) {
    return {
      commandId: createCommandId(),
      matchId,
      expectedSeq,
      correlationId: createCommandId(),
      clientTimestamp: new Date().toISOString(),
      payload
    };
  }

  function lifecycleCommand(
    path: string,
    matchId: string,
    input: { expectedSeq: number; payload: LifecycleCommandPayload }
  ) {
    return request<CommandResult>(
      `/matches/${encodeURIComponent(matchId)}${path}`,
      {
        method: "POST",
        body: JSON.stringify(createCommandEnvelope(matchId, input.expectedSeq, input.payload))
      },
      false,
      { acceptRawSuccess: true }
    );
  }

  async function lineupMutation(matchId: string, path: string, reason: string | null) {
    const data = await request<MatchLineupResponse>(
      `/matches/${encodeURIComponent(matchId)}${path}`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedSeq: null,
          commandId: null,
          reason: reason?.trim() ? reason.trim() : null
        })
      }
    );
    return data;
  }
}
