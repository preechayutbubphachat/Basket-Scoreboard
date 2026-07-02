import type { AuthenticatedUser, ReasonCode } from "@basket-scoreboard/api-contracts";

export type AuthState = {
  user: AuthenticatedUser | null;
  csrfToken: string | null;
  loading: boolean;
  error: {
    reasonCode: ReasonCode | string;
    message: string;
  } | null;
};

export type AuthAction =
  | { type: "LOADING" }
  | { type: "USER_LOADED"; user: AuthenticatedUser | null }
  | { type: "LOGIN_SUCCEEDED"; user: AuthenticatedUser; csrfToken: string }
  | { type: "LOGIN_FAILED"; reasonCode: ReasonCode | string; message: string }
  | { type: "ERROR"; reasonCode: ReasonCode | string; message: string }
  | { type: "LOGGED_OUT" };

export function createInitialAuthState(): AuthState {
  return {
    user: null,
    csrfToken: null,
    loading: false,
    error: null
  };
}

export function reduceAuthState(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOADING":
      return { ...state, loading: true, error: null };
    case "USER_LOADED":
      return { ...state, user: action.user, loading: false, error: null };
    case "LOGIN_SUCCEEDED":
      return {
        user: action.user,
        csrfToken: action.csrfToken,
        loading: false,
        error: null
      };
    case "LOGIN_FAILED":
    case "ERROR":
      return {
        ...state,
        user: action.type === "LOGIN_FAILED" ? null : state.user,
        loading: false,
        error: {
          reasonCode: action.reasonCode,
          message: action.message
        }
      };
    case "LOGGED_OUT":
      return createInitialAuthState();
  }
}

export function getRoleSummary(user: AuthenticatedUser | null) {
  if (!user) {
    return "Unauthenticated";
  }
  const roles = user.roles?.length ? user.roles : [user.role];
  return roles.join(", ");
}
