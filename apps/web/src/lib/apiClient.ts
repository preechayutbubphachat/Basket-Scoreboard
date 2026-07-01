import type {
  AuthenticatedUser,
  CommandResult,
  MatchAssignment,
  MatchOfficialRoleCode,
  MatchSyncResponse,
  OperatorMatchSummary,
  ReasonCode,
  ScoreAddedPayload,
  ScoreboardProjection,
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

export function createApiClient(options: { baseUrl?: string; fetchImpl?: FetchLike } = {}) {
  const baseUrl = options.baseUrl ?? getDefaultApiBaseUrl();
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  let csrfToken: string | null = null;

  function createCommandId() {
    return globalThis.crypto?.randomUUID?.() ?? "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (digit) =>
      (Number(digit) ^ (Math.random() * 16) >> (Number(digit) / 4)).toString(16)
    );
  }

  async function request<T>(
    path: string,
    init: RequestInit = {},
    retryingCsrf = false,
    options: { acceptRawSuccess?: boolean; skipCsrf?: boolean } = {}
  ): Promise<T> {
    const method = (init.method ?? "GET").toUpperCase();
    const isWrite = !["GET", "HEAD", "OPTIONS"].includes(method);
    if (isWrite && !csrfToken && !options.skipCsrf) {
      await ensureCsrfToken();
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
    if (response.ok && !isEnvelopeSuccess && options.acceptRawSuccess) {
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
        await ensureCsrfToken(true);
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

  async function ensureCsrfToken(force = false) {
    if (csrfToken && !force) {
      return csrfToken;
    }
    const data = await request<{ csrfToken: string }>("/auth/csrf", { method: "GET" }, true);
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
    async getOperatorMatches() {
      const data = await request<{ matches: OperatorMatchSummary[] }>("/operator/matches");
      return data.matches;
    },
    async getAdminMatches() {
      const data = await request<{ matches: OperatorMatchSummary[] }>("/matches");
      return data.matches;
    },
    async createSmokeMatch() {
      const data = await request<SmokeMatchResponse>("/matches/smoke", { method: "POST" });
      return data;
    },
    async getMatchState(matchId: string) {
      return request<ScoreboardProjection | null>(
        `/matches/${encodeURIComponent(matchId)}/state`,
        {},
        false,
        { acceptRawSuccess: true }
      );
    },
    async getMatchProjection(matchId: string) {
      return request<ScoreboardProjection>(
        `/matches/${encodeURIComponent(matchId)}/projection`,
        {},
        false,
        { acceptRawSuccess: true }
      );
    },
    async syncMatch(matchId: string, lastEventSeq: number) {
      return request<MatchSyncResponse>(
        `/matches/${encodeURIComponent(matchId)}/sync?lastEventSeq=${encodeURIComponent(String(lastEventSeq))}`,
        {},
        false,
        { acceptRawSuccess: true }
      );
    },
    async addScore(matchId: string, input: { expectedSeq: number; payload: ScoreAddedPayload }) {
      return request<CommandResult>(
        `/matches/${encodeURIComponent(matchId)}/commands/score/add`,
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
    async getPublicScoreboard(matchId: string) {
      return request<ScoreboardProjection>(
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
}
