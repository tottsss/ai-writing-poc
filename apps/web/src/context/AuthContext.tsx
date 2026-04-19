import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  refresh: () => Promise<string | null>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined
);

const ACCESS_TOKEN_KEY = "acw_access_token";
const REFRESH_TOKEN_KEY = "acw_refresh_token";

function loadStoredTokens(): AuthTokens | null {
  if (typeof window === "undefined") {
    return null;
  }
  const accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!accessToken || !refreshToken) {
    return null;
  }
  return { accessToken, refreshToken };
}

function persistTokens(tokens: AuthTokens | null): void {
  if (typeof window === "undefined") {
    return;
  }
  if (tokens) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  } else {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

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

function parseAccessToken(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const raw = (data as { access_token?: unknown }).access_token;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokensState] = useState<AuthTokens | null>(() =>
    loadStoredTokens()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null);

  const setTokens = useCallback((next: AuthTokens | null) => {
    persistTokens(next);
    setTokensState(next);
  }, []);

  useEffect(() => {
    // Keep tabs in sync: if the user logs out in another tab, clear here.
    const handler = (event: StorageEvent) => {
      if (event.key !== ACCESS_TOKEN_KEY && event.key !== REFRESH_TOKEN_KEY) {
        return;
      }
      const stored = loadStoredTokens();
      setTokensState(stored);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const login = useCallback(
    async (payload: LoginPayload) => {
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
    },
    [setTokens]
  );

  const logout = useCallback(() => {
    setTokens(null);
    setError(null);
  }, [setTokens]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refresh = useCallback(async (): Promise<string | null> => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const currentRefreshToken = tokens?.refreshToken;
    if (!currentRefreshToken) {
      return null;
    }

    const promise = (async (): Promise<string | null> => {
      try {
        const response = await fetch("/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: currentRefreshToken }),
        });

        if (!response.ok) {
          setTokens(null);
          return null;
        }

        const body: unknown = await response.json().catch(() => undefined);
        const nextAccessToken = parseAccessToken(body);
        if (!nextAccessToken) {
          setTokens(null);
          return null;
        }

        const nextTokens: AuthTokens = {
          accessToken: nextAccessToken,
          refreshToken: currentRefreshToken,
        };
        setTokens(nextTokens);
        return nextAccessToken;
      } catch {
        setTokens(null);
        return null;
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = promise;
    return promise;
  }, [setTokens, tokens?.refreshToken]);

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
      refresh,
    }),
    [tokens, isLoading, error, login, logout, clearError, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
