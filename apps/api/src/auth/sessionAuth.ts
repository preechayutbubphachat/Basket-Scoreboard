import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import bcrypt from "bcryptjs";
import {
  reasonCodes,
  type AuthenticatedUser,
  type AuthorizationDecision,
  type MatchAssignment,
  type PermissionCode,
  type ReasonCode,
  type RoleCode
} from "@basket-scoreboard/api-contracts";
import { apiError } from "../errors/apiErrors.js";
import { getUserMatchAssignments, isUserAssignedToMatch } from "../matchOfficials/matchOfficialService.js";

export type { AuthenticatedUser, AuthorizationDecision, PermissionCode, RoleCode };

export const defaultDevUserId = "00000000-0000-4000-8000-000000000001";

const rolePermissions: Record<RoleCode, PermissionCode[]> = {
  ADMIN: [
    "match.create",
    "match.read",
    "match.score.operate",
    "match.correction.request",
    "match.correction.apply",
    "match.correction.reject",
    "match.audit.read",
    "public.scoreboard.read"
  ],
  SCORER: ["match.read", "match.score.operate", "match.correction.request", "public.scoreboard.read"],
  REFEREE: ["match.read", "match.score.operate", "match.correction.request", "public.scoreboard.read"],
  VIEWER: ["match.read", "public.scoreboard.read"]
};

type UserRow = RowDataPacket & {
  user_id: string;
  email: string;
  display_name: string;
  password_hash: string | null;
  status: string;
};

type SessionRow = RowDataPacket & {
  id: string;
  user_id: string;
  session_token_hash: string;
  csrf_token_hash: string;
  status: string;
  expires_at: Date;
};

type RolePermissionRow = RowDataPacket & {
  role_key: string;
  permission_key: string | null;
};

function devAuthEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.DEV_AUTH_ENABLED === "true";
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

type AuthRouteConfig = {
  authRequired?: boolean;
  csrfRequired?: boolean;
  publicRoute?: boolean;
};

function getAuthRouteConfig(request: FastifyRequest) {
  return request.routeOptions?.config as AuthRouteConfig | undefined;
}

function isPreLoginPath(request: FastifyRequest) {
  const path = request.url.split("?")[0];
  return request.method === "POST" && path === "/api/v1/auth/login";
}

function isAuthExempt(request: FastifyRequest) {
  const config = getAuthRouteConfig(request);
  return config?.publicRoute === true || config?.authRequired === false || isPreLoginPath(request);
}

function isCsrfExempt(request: FastifyRequest) {
  const config = getAuthRouteConfig(request);
  return config?.publicRoute === true || config?.csrfRequired === false || isPreLoginPath(request);
}

function parseRole(value: string | undefined): RoleCode | null {
  if (value === "ADMIN" || value === "SCORER" || value === "REFEREE" || value === "VIEWER") {
    return value;
  }

  return null;
}

function parseAssignedMatchIds(value: string | undefined) {
  return value
    ? value
        .split(",")
        .map((matchId) => matchId.trim())
        .filter(Boolean)
    : [];
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

function getCookieName() {
  return process.env.AUTH_COOKIE_NAME || "basket_session";
}

function getSessionTtlMinutes() {
  const value = Number(process.env.AUTH_SESSION_TTL_MINUTES || 480);
  return Number.isFinite(value) && value > 0 ? value : 480;
}

function getCookieSecure() {
  if (process.env.AUTH_COOKIE_SECURE === "false") {
    return false;
  }

  if (process.env.AUTH_COOKIE_SECURE === "true") {
    return true;
  }

  return process.env.NODE_ENV === "production";
}

function getCookieSameSite() {
  const value = process.env.AUTH_COOKIE_SAME_SITE || "Lax";
  return value === "Strict" || value === "None" ? value : "Lax";
}

function getCookieDomain() {
  return process.env.AUTH_COOKIE_DOMAIN?.trim() || null;
}

function parseCookies(cookieHeader: string | undefined) {
  const cookies = new Map<string, string>();

  for (const part of (cookieHeader ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");

    if (name && rest.length > 0) {
      cookies.set(name, decodeURIComponent(rest.join("=")));
    }
  }

  return cookies;
}

function sessionCookie(token: string, maxAgeSeconds?: number) {
  const parts = [
    `${getCookieName()}=${encodeURIComponent(token)}`,
    "HttpOnly",
    `SameSite=${getCookieSameSite()}`,
    "Path=/"
  ];

  if (getCookieSecure()) {
    parts.push("Secure");
  }

  const domain = getCookieDomain();
  if (domain) {
    parts.push(`Domain=${domain}`);
  }

  if (maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }

  return parts.join("; ");
}

function clearSessionCookie() {
  return sessionCookie("", 0);
}

function safeCompareHash(rawToken: string, expectedHash: string) {
  const actual = Buffer.from(sha256(rawToken));
  const expected = Buffer.from(expectedHash);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function resolveDevUser(request: FastifyRequest): AuthenticatedUser | null {
  const roleHeader = headerValue(request.headers["x-dev-user-role"]);
  const role = parseRole(roleHeader);

  if (!role || !devAuthEnabled()) {
    return null;
  }

  const userId = headerValue(request.headers["x-dev-user-id"]) ?? defaultDevUserId;
  const assignedMatchIds = parseAssignedMatchIds(headerValue(request.headers["x-dev-match-ids"]));

  return {
    userId,
    role,
    roles: [role],
    permissions: rolePermissions[role],
    assignedMatchIds,
    deviceId: `dev-${role.toLowerCase()}-device`,
    authMode: "DEV_HEADER"
  };
}

async function loadRolesAndPermissions(connection: PoolConnection, userId: string) {
  const [rows] = await connection.query<RolePermissionRow[]>(
    "SELECT r.role_key, p.permission_key FROM user_roles ur INNER JOIN roles r ON r.role_id = ur.role_id LEFT JOIN role_permissions rp ON rp.role_id = r.role_id LEFT JOIN permissions p ON p.permission_id = rp.permission_id WHERE ur.user_id = ?",
    [userId]
  );
  const roles = Array.from(
    new Set(rows.map((row) => parseRole(row.role_key)).filter((role): role is RoleCode => Boolean(role)))
  );
  const permissions = Array.from(
    new Set(
      rows
        .map((row) => row.permission_key)
        .filter((permission): permission is PermissionCode => isPermissionCode(permission))
    )
  );

  return { roles, permissions };
}

function isPermissionCode(value: string | null): value is PermissionCode {
  return (
    value === "match.create" ||
    value === "match.read" ||
    value === "match.score.operate" ||
    value === "match.correction.request" ||
    value === "match.correction.apply" ||
    value === "match.correction.reject" ||
    value === "match.audit.read" ||
    value === "public.scoreboard.read"
  );
}

function publicUser(
  row: UserRow,
  roles: RoleCode[],
  permissions: PermissionCode[],
  matchAssignments: MatchAssignment[] = [],
  session?: SessionRow
): AuthenticatedUser {
  const primaryRole = roles[0] ?? "VIEWER";
  const user: AuthenticatedUser = {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: primaryRole,
    roles,
    permissions,
    assignedMatchIds: matchAssignments.map((assignment) => assignment.matchId),
    matchAssignments,
    deviceId: `session-${row.user_id}`,
    authMode: "SESSION" as const
  };

  if (session?.id) {
    user.sessionId = session.id;
  }

  return user;
}

export function serializeUser(user: AuthenticatedUser) {
  return {
    userId: user.userId,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    roles: user.roles ?? [user.role],
    permissions: user.permissions,
    assignedMatchIds: user.assignedMatchIds,
    matchAssignments: user.matchAssignments ?? [],
    authMode: user.authMode
  };
}

async function findUserByEmail(connection: PoolConnection, email: string) {
  const [rows] = await connection.query<UserRow[]>(
    "SELECT user_id, email, display_name, password_hash, status FROM users WHERE email = ?",
    [email]
  );

  return rows[0] ?? null;
}

async function findUserById(connection: PoolConnection, userId: string) {
  const [rows] = await connection.query<UserRow[]>(
    "SELECT user_id, email, display_name, password_hash, status FROM users WHERE user_id = ?",
    [userId]
  );

  return rows[0] ?? null;
}

export function createAuthHandlers(pool: Pool) {
  async function resolveSessionUser(request: FastifyRequest) {
    const token = parseCookies(headerValue(request.headers.cookie)).get(getCookieName());

    if (!token) {
      return { user: null, error: null as null | { reasonCode: string; message: string } };
    }

    const connection = await pool.getConnection();

    try {
      const tokenHash = sha256(token);
      const [sessionRows] = await connection.query<SessionRow[]>(
        "SELECT id, user_id, session_token_hash, csrf_token_hash, status, expires_at FROM user_sessions WHERE session_token_hash = ? LIMIT 1",
        [tokenHash]
      );
      const session = sessionRows[0];

      if (!session || !safeCompareHash(token, session.session_token_hash)) {
        return {
          user: null,
          error: { reasonCode: reasonCodes.UNAUTHENTICATED, message: "Authentication required" }
        };
      }

      if (session.status !== "ACTIVE") {
        return {
          user: null,
          error: { reasonCode: reasonCodes.SESSION_REVOKED, message: "Session was revoked" }
        };
      }

      if (new Date(session.expires_at).getTime() <= Date.now()) {
        return {
          user: null,
          error: { reasonCode: reasonCodes.SESSION_EXPIRED, message: "Session expired" }
        };
      }

      const userRow = await findUserById(connection, session.user_id);

      if (!userRow) {
        return {
          user: null,
          error: { reasonCode: reasonCodes.UNAUTHENTICATED, message: "Authentication required" }
        };
      }

      if (userRow.status !== "ACTIVE") {
        return {
          user: null,
          error: { reasonCode: reasonCodes.USER_INACTIVE, message: "User is inactive" }
        };
      }

      const { roles, permissions } = await loadRolesAndPermissions(connection, userRow.user_id);
      const matchAssignments = await getUserMatchAssignments(connection, userRow.user_id);
      await connection.query("UPDATE user_sessions SET last_seen_at = NOW(3) WHERE id = ?", [
        session.id
      ]);
      const user = publicUser(userRow, roles, permissions, matchAssignments, session);
      const csrfToken = headerValue(request.headers["x-csrf-token"]);

      if (csrfToken) {
        user.csrfToken = csrfToken;
      }

      return { user, error: null };
    } finally {
      connection.release();
    }
  }

  async function optionalAuth(request: FastifyRequest) {
    const sessionResult = await resolveSessionUser(request);

    if (sessionResult.user) {
      request.user = sessionResult.user;
      return;
    }

    const devUser = resolveDevUser(request);

    if (devUser) {
      request.user = devUser;
      return;
    }

    delete request.user;
  }

  async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    if (isAuthExempt(request)) {
      return;
    }

    const attemptedDevAuth = Boolean(headerValue(request.headers["x-dev-user-role"]));
    const sessionResult = await resolveSessionUser(request);

    if (sessionResult.user) {
      request.user = sessionResult.user;
      return;
    }

    if (sessionResult.error) {
      return reply
        .status(401)
        .send(apiError(sessionResult.error.reasonCode as ReasonCode, sessionResult.error.message));
    }

    const devUser = resolveDevUser(request);

    if (devUser) {
      request.user = devUser;
      return;
    }

    if (attemptedDevAuth && !devAuthEnabled()) {
      return reply
        .status(401)
        .send(apiError(reasonCodes.DEV_AUTH_DISABLED, "Development auth headers are disabled"));
    }

    return reply.status(401).send(apiError(reasonCodes.UNAUTHENTICATED, "Authentication required"));
  }

  async function authorize(
    user: AuthenticatedUser | null,
    permission: PermissionCode,
    resource: { matchId?: string } = {}
  ): Promise<AuthorizationDecision> {
    if (!user) {
      return {
        allowed: false,
        reasonCode: reasonCodes.UNAUTHENTICATED,
        message: "Authentication required"
      };
    }

    if (user.role === "ADMIN") {
      return { allowed: true };
    }

    if (!user.permissions.includes(permission)) {
      return {
        allowed: false,
        reasonCode: reasonCodes.FORBIDDEN,
        message: `Permission ${permission} is required`
      };
    }

    if (resource.matchId) {
      const assigned =
        user.authMode === "DEV_HEADER"
          ? user.assignedMatchIds.includes(resource.matchId)
          : await isUserAssignedToMatch(pool, user.userId, resource.matchId, permission);

      if (!assigned) {
        return {
          allowed: false,
          reasonCode: reasonCodes.MATCH_NOT_ASSIGNED,
          message: "User is not assigned to this match"
        };
      }
    }

    return { allowed: true };
  }

  async function authorizeGlobal(user: AuthenticatedUser | null, permission: PermissionCode) {
    if (!user) {
      return {
        allowed: false,
        reasonCode: reasonCodes.UNAUTHENTICATED,
        message: "Authentication required"
      };
    }

    if (user.role === "ADMIN") {
      return { allowed: true };
    }

    if (!user.permissions.includes(permission)) {
      return {
        allowed: false,
        reasonCode: reasonCodes.FORBIDDEN,
        message: `Permission ${permission} is required`
      };
    }

    return { allowed: true };
  }

  function requirePermission(permission: PermissionCode) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const decision = await authorizeGlobal(request.user ?? null, permission);

      if (!decision.allowed) {
        return reply
          .status(403)
          .send(apiError(decision.reasonCode ?? reasonCodes.FORBIDDEN, decision.message ?? "Forbidden"));
      }
    };
  }

  function requireMatchPermission(
    permission: PermissionCode,
    getMatchId: (request: FastifyRequest) => string
  ) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const decision = await authorize(request.user ?? null, permission, { matchId: getMatchId(request) });

      if (!decision.allowed) {
        return reply
          .status(403)
          .send(apiError(decision.reasonCode ?? reasonCodes.FORBIDDEN, decision.message ?? "Forbidden"));
      }
    };
  }

  async function requireCsrf(request: FastifyRequest, reply: FastifyReply) {
    if (isCsrfExempt(request)) {
      return;
    }

    if (process.env.NODE_ENV === "test" && process.env.AUTH_TEST_DISABLE_CSRF === "true") {
      return;
    }

    if (!request.user?.sessionId) {
      return reply.status(403).send(apiError(reasonCodes.CSRF_REQUIRED, "CSRF token is required"));
    }

    const csrfToken = headerValue(request.headers["x-csrf-token"]);

    if (!csrfToken) {
      return reply.status(403).send(apiError(reasonCodes.CSRF_REQUIRED, "CSRF token is required"));
    }

    const connection = await pool.getConnection();

    try {
      const [rows] = await connection.query<SessionRow[]>(
        "SELECT csrf_token_hash FROM user_sessions WHERE id = ? AND status = 'ACTIVE'",
        [request.user.sessionId]
      );
      const csrfHash = rows[0]?.csrf_token_hash;

      if (!csrfHash || !safeCompareHash(csrfToken, csrfHash)) {
        return reply.status(403).send(apiError(reasonCodes.CSRF_INVALID, "CSRF token is invalid"));
      }
    } finally {
      connection.release();
    }
  }

  return {
    optionalAuth,
    requireAuth,
    requirePermission,
    requireMatchPermission,
    requireCsrf
  };
}

export async function loginWithPassword(pool: Pool, input: { email: string; password: string }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const userRow = await findUserByEmail(connection, input.email);

    if (!userRow || !userRow.password_hash) {
      await connection.rollback();
      return { ok: false as const, status: 401, error: reasonCodes.INVALID_CREDENTIALS };
    }

    const passwordOk = await bcrypt.compare(input.password, userRow.password_hash);

    if (!passwordOk) {
      await connection.rollback();
      return { ok: false as const, status: 401, error: reasonCodes.INVALID_CREDENTIALS };
    }

    if (userRow.status !== "ACTIVE") {
      await connection.rollback();
      return { ok: false as const, status: 403, error: reasonCodes.USER_INACTIVE };
    }

    const { roles, permissions } = await loadRolesAndPermissions(connection, userRow.user_id);
    const matchAssignments = await getUserMatchAssignments(connection, userRow.user_id);
    const sessionToken = randomToken();
    const csrfToken = randomToken();
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + getSessionTtlMinutes() * 60_000);

    await connection.query(
      "INSERT INTO user_sessions (id, user_id, session_token_hash, csrf_token_hash, status, expires_at, created_at, ip_address_hash, user_agent_hash) VALUES (?, ?, ?, ?, 'ACTIVE', ?, NOW(3), ?, ?)",
      [
        sessionId,
        userRow.user_id,
        sha256(sessionToken),
        sha256(csrfToken),
        expiresAt,
        null,
        null
      ]
    );
    await connection.query("UPDATE users SET last_login_at = NOW(3) WHERE user_id = ?", [
      userRow.user_id
    ]);
    await connection.commit();

    return {
      ok: true as const,
      sessionToken,
      csrfToken,
      cookie: sessionCookie(sessionToken, getSessionTtlMinutes() * 60),
      user: publicUser(userRow, roles, permissions, matchAssignments, {
        id: sessionId,
        user_id: userRow.user_id,
        session_token_hash: "",
        csrf_token_hash: "",
        status: "ACTIVE",
        expires_at: expiresAt
      } as SessionRow)
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function revokeCurrentSession(pool: Pool, user: AuthenticatedUser) {
  if (!user.sessionId) {
    return;
  }

  await pool.query(
    "UPDATE user_sessions SET status = 'REVOKED', revoked_at = NOW(3) WHERE id = ? AND status = 'ACTIVE'",
    [user.sessionId]
  );
}

export async function rotateCsrfToken(pool: Pool, user: AuthenticatedUser) {
  if (!user.sessionId) {
    return null;
  }

  const csrfToken = randomToken();
  await pool.query("UPDATE user_sessions SET csrf_token_hash = ? WHERE id = ? AND status = 'ACTIVE'", [
    sha256(csrfToken),
    user.sessionId
  ]);

  return csrfToken;
}

export { clearSessionCookie };
