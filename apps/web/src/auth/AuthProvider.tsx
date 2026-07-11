import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import type { AuthenticatedUser } from "@basket-scoreboard/api-contracts";
import { ApiClientError, createApiClient, type ApiClient } from "../lib/apiClient";
import { createInitialAuthState, getRoleSummary, reduceAuthState, type AuthState } from "../lib/authState";

type AuthContextValue = {
  state: AuthState;
  api: ApiClient;
  currentUser: AuthenticatedUser | null;
  roleSummary: string;
  refreshCurrentUser: () => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  bootstrapCurrentUser,
  children
}: {
  bootstrapCurrentUser: boolean;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reduceAuthState, bootstrapCurrentUser, (shouldBootstrap) => ({
    ...createInitialAuthState(),
    loading: shouldBootstrap
  }));
  const api = useMemo(() => createApiClient(), []);

  async function refreshCurrentUser() {
    dispatch({ type: "LOADING" });
    try {
      const user = await api.getCurrentUser();
      dispatch({ type: "USER_LOADED", user });
    } catch (error) {
      if (error instanceof ApiClientError && ["UNAUTHENTICATED", "SESSION_EXPIRED", "SESSION_REVOKED"].includes(error.reasonCode)) {
        dispatch({ type: "USER_LOADED", user: null });
        return;
      }
      dispatch({
        type: "ERROR",
        reasonCode: error instanceof ApiClientError ? error.reasonCode : "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unable to load current user"
      });
    }
  }

  async function login(input: { email: string; password: string }) {
    dispatch({ type: "LOADING" });
    try {
      const result = await api.login(input);
      dispatch({ type: "LOGIN_SUCCEEDED", user: result.user, csrfToken: result.csrfToken });
    } catch (error) {
      dispatch({
        type: "LOGIN_FAILED",
        reasonCode: error instanceof ApiClientError ? error.reasonCode : "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Login failed"
      });
    }
  }

  async function logout() {
    try {
      await api.logout();
    } finally {
      dispatch({ type: "LOGGED_OUT" });
    }
  }

  useEffect(() => {
    if (!bootstrapCurrentUser) return;
    void refreshCurrentUser();
  }, [bootstrapCurrentUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      api,
      currentUser: state.user,
      roleSummary: getRoleSummary(state.user),
      refreshCurrentUser,
      login,
      logout
    }),
    [state, api]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useCurrentUser() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useCurrentUser must be used inside AuthProvider");
  }
  return context;
}
