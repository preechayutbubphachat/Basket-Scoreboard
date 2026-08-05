import {
  assignmentRoleAllowsPermission,
  matchOperatorPermissions,
  type MatchOfficialRoleCode,
  type PermissionCode,
  type RoleCode
} from "@basket-scoreboard/api-contracts";

const basePermissionsBySystemRole: Record<RoleCode, readonly PermissionCode[]> = {
  ADMIN: [
    "match.create",
    "match.read",
    ...matchOperatorPermissions,
    "match.correction.request",
    "match.correction.apply",
    "match.correction.reject",
    "match.audit.read",
    "public.scoreboard.read"
  ],
  SCORER: [
    "match.read",
    ...matchOperatorPermissions,
    "match.correction.request",
    "public.scoreboard.read"
  ],
  REFEREE: ["match.read", "match.correction.request", "public.scoreboard.read"],
  VIEWER: ["match.read", "public.scoreboard.read"]
};

export function permissionsForSystemRole(role: RoleCode): PermissionCode[] {
  return [...basePermissionsBySystemRole[role]];
}

export function mergeCodeDerivedPermissions(roles: readonly RoleCode[], persisted: readonly PermissionCode[]) {
  return Array.from(new Set([...persisted, ...roles.flatMap(permissionsForSystemRole)]));
}

export function defaultAssignmentRoleForSystemRole(role: RoleCode): MatchOfficialRoleCode | null {
  if (role === "SCORER") return "SCORER";
  if (role === "REFEREE") return "REFEREE";
  return null;
}

export const matchCommandPermissions = {
  score: "match.score.operate",
  foul: "match.foul.operate",
  gameClock: "match.clock.game.operate",
  shotClock: "match.clock.shot.operate",
  timeout: "match.timeout.operate",
  lifecycle: "match.lifecycle.operate"
} as const;

export { assignmentRoleAllowsPermission };
