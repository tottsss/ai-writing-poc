import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { LoginPayload } from "../types/auth";

type LoginLocationState = {
  from?: string;
};

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading, error, clearError } = useAuth();

  const [form, setForm] = useState<LoginPayload>({ email: "", password: "" });

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await login(form);
    } catch {
      return;
    }

    const fromPath = (location.state as LoginLocationState | null)?.from;
    navigate(fromPath ?? "/dashboard", { replace: true });
  };

  return (
    <div className="page-center">
      <section className="card login-card">
        <h2>Academic Writing Platform</h2>
        <p className="muted">Sign in to continue to your collaborative workspace.</p>

        <form className="stack" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={(event) => {
              clearError();
              setForm((prev) => ({ ...prev, email: event.target.value }));
            }}
            placeholder="researcher@university.edu"
            required
          />

          <label className="field-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={form.password}
            onChange={(event) => {
              clearError();
              setForm((prev) => ({ ...prev, password: event.target.value }));
            }}
            placeholder="********"
            required
          />

          {error ? <p className="error-text">{error}</p> : null}

          <button type="submit" disabled={isLoading}>
            {isLoading ? "Signing in..." : "Login"}
          </button>
        </form>
      </section>
    </div>
  );
}

export default Login;
