import type {
  AuthenticatedUser,
  MatchOfficialRoleCode,
  ReasonCode,
  RoleCode
} from "@basket-scoreboard/api-contracts";

export const matchOfficialRoleCodes: MatchOfficialRoleCode[] = [
  "REFEREE",
  "SCORER",
  "ASSISTANT_SCORER",
  "TIMER",
  "SHOT_CLOCK_OPERATOR",
  "MATCH_OPERATOR"
];

export type ProtectedRouteDecision =
  | { action: "ALLOW" }
  | { action: "REDIRECT"; to: "/login" | "/unauthorized" };

export type AssignmentFormState = {
  userId: string;
  roleCode: MatchOfficialRoleCode;
};

export function canManageAssignments(user: AuthenticatedUser | null) {
  return user?.role === "ADMIN" || Boolean(user?.roles?.includes("ADMIN"));
}

export function getProtectedRouteDecision(
  user: AuthenticatedUser | null,
  options: { requireRole?: RoleCode } = {}
): ProtectedRouteDecision {
  if (!user) {
    return { action: "REDIRECT", to: "/login" };
  }

  if (options.requireRole === "ADMIN" && !canManageAssignments(user)) {
    return { action: "REDIRECT", to: "/unauthorized" };
  }

  return { action: "ALLOW" };
}

export function createAssignmentFormState(input?: Partial<AssignmentFormState>): AssignmentFormState {
  return {
    userId: input?.userId ?? "",
    roleCode: input?.roleCode ?? "SCORER"
  };
}

export function validateAssignmentForm(form: AssignmentFormState):
  | { ok: true }
  | { ok: false; reasonCode: ReasonCode | string; message: string } {
  if (!form.userId.trim()) {
    return {
      ok: false,
      reasonCode: "VALIDATION_ERROR",
      message: "User ID is required"
    };
  }

  if (!matchOfficialRoleCodes.includes(form.roleCode)) {
    return {
      ok: false,
      reasonCode: "VALIDATION_ERROR",
      message: "Role code is invalid"
    };
  }

  return { ok: true };
}

export async function submitAssignmentForm(
  api: {
    assignOfficial: (
      matchId: string,
      input: { userId: string; roleCode: MatchOfficialRoleCode }
    ) => Promise<{ id: string }>;
  },
  matchId: string,
  form: AssignmentFormState
) {
  const validation = validateAssignmentForm(form);

  if (!validation.ok) {
    return validation;
  }

  const assignment = await api.assignOfficial(matchId, {
    userId: form.userId.trim(),
    roleCode: form.roleCode
  });

  return {
    ok: true as const,
    assignmentId: assignment.id
  };
}

export function validateRevokeReason(reason: string):
  | { ok: true }
  | { ok: false; reasonCode: "REASON_REQUIRED"; message: string } {
  if (!reason.trim()) {
    return {
      ok: false,
      reasonCode: "REASON_REQUIRED",
      message: "Revocation reason is required"
    };
  }

  return { ok: true };
}
