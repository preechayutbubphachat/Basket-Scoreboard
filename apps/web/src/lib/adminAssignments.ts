import type {
  AuthenticatedUser,
  MatchOfficialRoleCode,
  OfficialCandidate,
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
  roleCode: MatchOfficialRoleCode | "";
};

export type AssignmentCandidateOption = {
  value: string;
  label: string;
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
    roleCode: input?.roleCode ?? ""
  };
}

export function getAssignmentFormLabels() {
  return {
    official: "Official",
    officialPlaceholder: "Select official",
    role: "Role code"
  };
}

export function createAssignmentCandidateOptions(candidates: OfficialCandidate[]): AssignmentCandidateOption[] {
  return candidates.map((candidate) => {
    const roleLabel = candidate.roles.length ? ` (${candidate.roles.join(", ")})` : "";
    return {
      value: candidate.userId,
      label: `${candidate.displayName?.trim() || candidate.userId}${roleLabel}`
    };
  });
}

export function isAssignmentSubmitDisabled(form: AssignmentFormState, saving: boolean) {
  return saving || !form.userId.trim() || !form.roleCode || !matchOfficialRoleCodes.includes(form.roleCode);
}

export function toAssignmentValidationMessage(reasonCode: string) {
  if (reasonCode === "USER_REQUIRED" || reasonCode === "USER_NOT_FOUND" || reasonCode === "VALIDATION_ERROR") {
    return "Please select a valid official.";
  }

  if (reasonCode === "DUPLICATE_ASSIGNMENT") {
    return "This official is already assigned to this role.";
  }

  if (reasonCode === "ROLE_REQUIRED" || reasonCode === "INVALID_OFFICIAL_ROLE") {
    return "Please select a valid role.";
  }

  return null;
}

export function validateAssignmentForm(form: AssignmentFormState):
  | { ok: true }
  | { ok: false; reasonCode: ReasonCode | string; message: string } {
  if (!form.userId.trim()) {
    return {
      ok: false,
      reasonCode: "USER_REQUIRED",
      message: "Please select a valid official."
    };
  }

  if (!form.roleCode || !matchOfficialRoleCodes.includes(form.roleCode)) {
    return {
      ok: false,
      reasonCode: "ROLE_REQUIRED",
      message: "Please select a valid role."
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
    roleCode: form.roleCode as MatchOfficialRoleCode
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
