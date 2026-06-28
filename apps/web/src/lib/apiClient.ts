import type {
  AuthenticatedUser,
  MatchAssignment,
  MatchOfficialRoleCode,
  OperatorMatchSummary,
  ReasonCode
} from "@basket-scoreboard/api-contracts";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type ApiErrorEnvelope = {
  error?: {
    reasonCode?: ReasonCode | string;
    code?: ReasonCode | string;
    message?: string;
    details?: unknown;
  };
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
  return import.meta.env.VITE_API_BASE_URL || "/api/v1";
}

export function createApiClient(options: { baseUrl?: string; fetchImpl?: FetchLike } = {}) {
  const baseUrl = (options.baseUrl ?? getDefaultApiBaseUrl()).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  let csrfToken: string | null = null;

  async function request<T>(path: string, init: RequestInit = {}, retryingCsrf = false): Promise<T> {
    const method = (init.method ?? "GET").toUpperCase();
    const isWrite = !["GET", "HEAD", "OPTIONS"].includes(method);
    const existingHeaders = init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : init.headers;
    const headers: Record<string, string> = { ...(existingHeaders as Record<string, string> | undefined) };

    if (isWrite) {
      headers["content-type"] = headers["content-type"] ?? "application/json";
      if (!csrfToken) {
        await ensureCsrfToken();
      }
      if (csrfToken) {
        headers["x-csrf-token"] = csrfToken;
      }
    }

    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers
    });
    const payload = (await response.json().catch(() => ({}))) as ApiSuccess<T> | ApiErrorEnvelope;

    if (!response.ok || !("ok" in payload && payload.ok === true)) {
      const error = "error" in payload ? payload.error : undefined;
      const reasonCode = error?.reasonCode ?? error?.code ?? `HTTP_${response.status}`;
      const recoverable = reasonCode === "CSRF_REQUIRED" || reasonCode === "CSRF_INVALID";

      if (recoverable && !retryingCsrf) {
        csrfToken = null;
        await ensureCsrfToken(true);
      }

      throw new ApiClientError({
        reasonCode,
        message: error?.message ?? "Request failed",
        status: response.status,
        details: error?.details,
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
      const data = await request<{ user: AuthenticatedUser; csrfToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input)
      });
      csrfToken = data.csrfToken;
      return data;
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
      const data = await request<{ matches: OperatorMatchSummary[] }>("/admin/matches");
      return data.matches;
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
