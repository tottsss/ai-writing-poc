import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { authFetch } from "../lib/apiClient";
import { ApiError, fetchDocuments } from "../services/documentService";
import type { DocumentSummary } from "../types/document";

type CurrentUser = {
  name: string;
  email: string;
};

function parseUser(data: unknown): CurrentUser | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const name = (data as { name?: unknown }).name;
  const email = (data as { email?: unknown }).email;
  if (typeof name !== "string" || typeof email !== "string") {
    return null;
  }
  return { name, email };
}

function getInitials(name: string, fallbackEmail: string): string {
  const source = name.trim().length > 0 ? name.trim() : fallbackEmail;
  const parts = source.split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const { accessToken, logout } = auth;

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);

  const loadCurrentUser = useCallback(async () => {
    if (!accessToken) {
      setCurrentUser(null);
      return;
    }

    try {
      const response = await authFetch("/me", { method: "GET" }, auth);
      if (response.status === 401) {
        logout();
        return;
      }
      const body: unknown = await response.json().catch(() => undefined);
      if (!response.ok) {
        return;
      }
      setCurrentUser(parseUser(body));
    } catch {
      setCurrentUser(null);
    }
  }, [accessToken, auth, logout]);

  const loadDocuments = useCallback(async () => {
    if (!accessToken) {
      setDocuments([]);
      return;
    }

    try {
      const response = await fetchDocuments(auth);
      setDocuments(response.documents);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        logout();
        return;
      }
      setDocuments([]);
    }
  }, [accessToken, auth, logout]);

  useEffect(() => {
    void loadCurrentUser();
    void loadDocuments();
  }, [loadCurrentUser, loadDocuments, location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const isEditorPage = location.pathname.startsWith("/editor/");
  const pageTitle = isEditorPage ? "Document Editor" : "Dashboard";

  const displayName = currentUser?.name?.trim() || currentUser?.email || "";
  const roleLabel = currentUser?.email ?? "";
  const initials = useMemo(
    () => getInitials(currentUser?.name ?? "", currentUser?.email ?? "?"),
    [currentUser?.email, currentUser?.name]
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="flex flex-col border-r border-slate-200 bg-white px-4 py-6 lg:px-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">
              Scholar Draft
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Academic Collaboration
            </p>
          </div>

          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `mt-6 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`
            }
          >
            Dashboard
          </NavLink>

          <div className="mt-6">
            <p className="px-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              Documents
            </p>
            <nav className="mt-2 space-y-1" aria-label="Document navigation">
              {documents.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-400">
                  No documents yet.
                </p>
              ) : (
                documents.map((document) => (
                  <NavLink
                    key={document.id}
                    to={`/editor/${document.id}`}
                    className={({ isActive }) =>
                      `block rounded-xl px-3 py-2 transition ${
                        isActive
                          ? "bg-slate-900 text-white"
                          : "text-slate-700 hover:bg-slate-100"
                      }`
                    }
                  >
                    <p className="text-sm font-medium leading-tight">
                      {document.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Updated {formatRelative(document.lastUpdated)}
                    </p>
                  </NavLink>
                ))
              )}
            </nav>
          </div>

          <button
            type="button"
            className="mt-auto rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
            onClick={handleLogout}
          >
            Log Out
          </button>
        </aside>

        <main className="flex min-h-screen flex-col">
          <header className="border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur lg:px-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Workspace
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
                  {pageTitle}
                </h2>
              </div>

              {currentUser ? (
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-900">
                      {displayName}
                    </p>
                    <p className="text-xs text-slate-500">{roleLabel}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold uppercase text-white">
                    {initials}
                  </div>
                </div>
              ) : null}
            </div>
          </header>

          <section className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
            <Outlet />
          </section>
        </main>
      </div>
    </div>
  );
}

export default Layout;
