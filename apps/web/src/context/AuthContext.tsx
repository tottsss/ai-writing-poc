import {
  createContext,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { LoginPayload, LoginResponse } from "../types/auth";

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthContextValue = {
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => void;
  clearError: () => void;
};

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined
);

function getErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  if (
    "detail" in data &&
    typeof (data as { detail?: unknown }).detail === "string"
  ) {
    return (data as { detail: string }).detail;
  }

  if (
    "message" in data &&
    typeof (data as { message?: unknown }).message === "string"
  ) {
    return (data as { message: string }).message;
  }

  if (
    "error" in data &&
    typeof (data as { error?: unknown }).error === "string"
  ) {
    return (data as { error: string }).error;
  }

  return null;
}

function parseTokens(data: unknown): AuthTokens | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const maybeAccessToken = (data as { access_token?: unknown }).access_token;
  const maybeRefreshToken = (data as { refresh_token?: unknown }).refresh_token;

  if (
    typeof maybeAccessToken === "string" &&
    typeof maybeRefreshToken === "string"
  ) {
    const response = data as LoginResponse;
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
    };
  }

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (payload: LoginPayload) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responseData: unknown = await response
        .json()
        .catch(() => undefined as unknown);

      if (!response.ok) {
        const message =
          getErrorMessage(responseData) ??
          "Login failed. Check your credentials and try again.";
        throw new Error(message);
      }

      const nextTokens = parseTokens(responseData);
      if (!nextTokens) {
        throw new Error("Invalid login response from server.");
      }

      setTokens(nextTokens);
    } catch (caughtError) {
      setTokens(null);
      const message =
        caughtError instanceof Error ? caughtError.message : "Login failed.";
      setError(message);
      throw caughtError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setTokens(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken: tokens?.accessToken ?? null,
      refreshToken: tokens?.refreshToken ?? null,
      isAuthenticated: Boolean(tokens?.accessToken),
      isLoading,
      error,
      login,
      logout,
      clearError,
    }),
    [tokens, isLoading, error, login, logout, clearError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
