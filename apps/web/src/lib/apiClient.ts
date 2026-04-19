import type { AuthContextValue } from "../context/AuthContext";

export type AuthLike = Pick<
  AuthContextValue,
  "accessToken" | "refreshToken" | "refresh" | "logout"
>;

export interface AuthFetchOptions extends RequestInit {
  skipAuth?: boolean;
}

function withAuthHeader(init: RequestInit, token: string | null): RequestInit {
  if (!token) {
    return init;
  }
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

/**
 * Authenticated fetch. If the first request returns 401 and a refresh token
 * exists, transparently refresh the access token once and retry.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: AuthFetchOptions = {},
  auth: AuthLike
): Promise<Response> {
  const { skipAuth, ...requestInit } = init;

  if (skipAuth) {
    return fetch(input, requestInit);
  }

  const firstAttempt = await fetch(
    input,
    withAuthHeader(requestInit, auth.accessToken)
  );

  if (firstAttempt.status !== 401 || !auth.refreshToken) {
    return firstAttempt;
  }

  const nextAccessToken = await auth.refresh();
  if (!nextAccessToken) {
    auth.logout();
    return firstAttempt;
  }

  return fetch(input, withAuthHeader(requestInit, nextAccessToken));
}
