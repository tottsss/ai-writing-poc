import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const documents = [
  {
    id: "101",
    title: "Literature Review Draft",
    updatedAt: "Updated 2h ago",
  },
  {
    id: "102",
    title: "Methodology Notes",
    updatedAt: "Updated yesterday",
  },
  {
    id: "103",
    title: "Conference Revision",
    updatedAt: "Updated 3 days ago",
  },
];

function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const isEditorPage = location.pathname.startsWith("/editor/");
  const pageTitle = isEditorPage ? "Document Editor" : "Dashboard";

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
              {documents.map((document) => (
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
                    {document.updatedAt}
                  </p>
                </NavLink>
              ))}
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

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-900">
                    Fatema Alyaffei
                  </p>
                  <p className="text-xs text-slate-500">
                    Research Collaborator
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold uppercase text-white">
                  FA
                </div>
              </div>
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
