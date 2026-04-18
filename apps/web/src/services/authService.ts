const TOKEN_KEY = "acw_platform_jwt";

function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

function isAuthenticated(): boolean {
  return Boolean(getToken());
}

export const authService = {
  getToken,
  setToken,
  clearToken,
  isAuthenticated,
};
