import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import { useAuth } from "../hooks/useAuth";

jest.mock("../hooks/useAuth", () => ({
  useAuth: jest.fn(),
}));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

describe("App", () => {
  it("renders the login page initially for unauthenticated users", async () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      register: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      clearError: jest.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole("heading", { name: /academic writing platform/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/sign in to continue/i)).toBeInTheDocument();
  });
});