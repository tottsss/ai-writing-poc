import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext, type AuthContextValue } from "../context/AuthContext";
import ProtectedRoute from "./ProtectedRoute";

function renderWithAuth(isAuthenticated: boolean) {
  const authValue: AuthContextValue = {
    accessToken: isAuthenticated ? "access-token" : null,
    refreshToken: isAuthenticated ? "refresh-token" : null,
    isAuthenticated,
    isLoading: false,
    error: null,
    login: async () => undefined,
    logout: () => undefined,
    clearError: () => undefined,
  };

  render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<h1>Dashboard</h1>} />
          </Route>
          <Route path="/login" element={<h1>Login</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe("ProtectedRoute", () => {
  it("redirects unauthenticated users to /login", async () => {
    renderWithAuth(false);

    expect(
      await screen.findByRole("heading", { name: /login/i })
    ).toBeInTheDocument();
  });

  it("renders protected content for authenticated users", async () => {
    renderWithAuth(true);

    expect(
      await screen.findByRole("heading", { name: /dashboard/i })
    ).toBeInTheDocument();
  });
});
