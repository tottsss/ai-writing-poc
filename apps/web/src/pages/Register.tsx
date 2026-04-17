import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

type RegisterForm = {
  email: string;
  password: string;
  name: string;
};

function Register() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [form, setForm] = useState<RegisterForm>({
    email: "",
    password: "",
    name: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const detail =
          (body && typeof body === "object" && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : null) ?? "Registration failed. Please try again.";
        throw new Error(detail);
      }

      setSuccess("Account created. Redirecting to login...");
      setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Registration failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-center">
      <section className="card login-card">
        <h2>Create your account</h2>
        <p className="muted">Sign up to start collaborating on documents.</p>

        <form className="stack" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            type="text"
            value={form.name}
            onChange={(e) => {
              setError(null);
              setForm((prev) => ({ ...prev, name: e.target.value }));
            }}
            placeholder="Your full name"
            required
          />

          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => {
              setError(null);
              setForm((prev) => ({ ...prev, email: e.target.value }));
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
            onChange={(e) => {
              setError(null);
              setForm((prev) => ({ ...prev, password: e.target.value }));
            }}
            placeholder="At least 8 characters"
            minLength={8}
            required
          />

          {error ? <p className="error-text">{error}</p> : null}
          {success ? <p className="muted">{success}</p> : null}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Register"}
          </button>

          <p className="muted" style={{ textAlign: "center", marginTop: "0.5rem" }}>
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </form>
      </section>
    </div>
  );
}

export default Register;
