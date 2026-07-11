import type { FastifyReply, FastifyRequest } from "fastify";
import {
  reasonCodes,
  type AuthenticatedUser,
  type AuthorizationDecision,
  type PermissionCode,
  type RoleCode
} from "@basket-scoreboard/api-contracts";
import { apiError } from "../errors/apiErrors.js";
import {
  assignmentRoleAllowsPermission,
  defaultAssignmentRoleForSystemRole,
  permissionsForSystemRole
} from "./operatorPermissionPolicy.js";

export type { AuthenticatedUser, AuthorizationDecision, PermissionCode, RoleCode };

export const defaultDevUserId = "00000000-0000-4000-8000-000000000001";

function devAuthEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.DEV_AUTH_ENABLED === "true";
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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

export function resolveDevUser(request: FastifyRequest): AuthenticatedUser | null {
  const roleHeader = headerValue(request.headers["x-dev-user-role"]);
  const role = parseRole(roleHeader);

  if (!role) {
    return null;
  }

  if (!devAuthEnabled()) {
    return null;
  }

  const userId = headerValue(request.headers["x-dev-user-id"]) ?? defaultDevUserId;
  const assignedMatchIds = parseAssignedMatchIds(headerValue(request.headers["x-dev-match-ids"]));

  return {
    userId,
    role,
    permissions: permissionsForSystemRole(role),
    assignedMatchIds,
    deviceId: `dev-${role.toLowerCase()}-device`,
    authMode: "DEV_HEADER"
  };
}

export function getCurrentUser(request: FastifyRequest) {
  return request.user ?? null;
}

export async function optionalAuth(request: FastifyRequest) {
  const user = resolveDevUser(request);

  if (user) {
    request.user = user;
    return;
  }

  delete request.user;
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const attemptedDevAuth = Boolean(headerValue(request.headers["x-dev-user-role"]));
  const user = resolveDevUser(request);

  if (user) {
    request.user = user;
    return;
  }

  if (attemptedDevAuth && !devAuthEnabled()) {
    return reply
      .status(401)
      .send(apiError(reasonCodes.DEV_AUTH_DISABLED, "Development auth headers are disabled"));
  }

  return reply.status(401).send(apiError(reasonCodes.UNAUTHENTICATED, "Authentication required"));
}

export function authorize(
  user: AuthenticatedUser | null,
  permission: PermissionCode,
  resource: { matchId?: string } = {}
): AuthorizationDecision {
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
      reasonCode: reasonCodes.INSUFFICIENT_PERMISSION,
      message: "Operation is not permitted"
    };
  }

  const assignmentRole = defaultAssignmentRoleForSystemRole(user.role);
  if (
    resource.matchId &&
    (
      !user.assignedMatchIds.includes(resource.matchId) ||
      !assignmentRoleAllowsPermission(assignmentRole ?? "", permission)
    )
  ) {
    return {
      allowed: false,
      reasonCode: reasonCodes.MATCH_NOT_ASSIGNED,
      message: "User is not assigned to this match"
    };
  }

  return { allowed: true };
}

export function requirePermission(permission: PermissionCode) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const decision = authorize(getCurrentUser(request), permission);

    if (!decision.allowed) {
      return reply
        .status(403)
        .send(apiError(decision.reasonCode ?? reasonCodes.FORBIDDEN, decision.message ?? "Forbidden"));
    }
  };
}

export function requireMatchPermission(
  permission: PermissionCode,
  getMatchId: (request: FastifyRequest) => string
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const decision = authorize(getCurrentUser(request), permission, { matchId: getMatchId(request) });

    if (!decision.allowed) {
      return reply
        .status(403)
        .send(apiError(decision.reasonCode ?? reasonCodes.FORBIDDEN, decision.message ?? "Forbidden"));
    }
  };
}

export async function placeholderAuth(request: FastifyRequest) {
  await requireAuth(request, {
    status: () => ({ send: async () => undefined })
  } as unknown as FastifyReply);
}

export const requireScorerOrAdmin = requirePermission("match.score.operate");
