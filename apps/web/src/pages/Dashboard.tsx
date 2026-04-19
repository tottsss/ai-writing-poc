import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  ApiError,
  createDocument,
  fetchDocuments,
} from "../services/documentService";
import type { DocumentSummary } from "../types/document";

function Dashboard() {
  const navigate = useNavigate();
  const { accessToken, logout } = useAuth();

  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetchDocuments(accessToken);
      setDocuments(response.documents);
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load documents.";
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, logout, navigate]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const handleCreateDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newTitle.trim();

    if (!title) {
      setCreateError("Document title is required.");
      return;
    }

    setCreateError(null);
    setIsCreating(true);

    try {
      const createdDocument = await createDocument({ title }, accessToken);
      setDocuments((prev) => [createdDocument, ...prev]);
      setNewTitle("");
      navigate(`/editor/${createdDocument.id}`);
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to create document.";
      setCreateError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const openEditor = (documentId: string) => {
    navigate(`/editor/${documentId}`);
  };

  return (
    <section>
      <div className="section-heading">
        <h2>Dashboard</h2>
        <p className="muted">Recent writing projects and shared drafts.</p>
      </div>

      <div className="card">
        <form className="dashboard-create-form" onSubmit={handleCreateDocument}>
          <label className="field-label" htmlFor="new-document-title">
            New document title
          </label>
          <div className="dashboard-create-row">
            <input
              id="new-document-title"
              type="text"
              value={newTitle}
              onChange={(event) => {
                setCreateError(null);
                setNewTitle(event.target.value);
              }}
              placeholder="e.g. Results and Discussion Draft"
            />
            <button type="submit" disabled={isCreating}>
              {isCreating ? "Creating..." : "Create"}
            </button>
          </div>
          {createError ? <p className="error-text">{createError}</p> : null}
        </form>
      </div>

      <div className="card">
        {isLoading ? <p className="muted">Loading documents...</p> : null}

        {loadError ? (
          <div className="dashboard-error-block">
            <p className="error-text">{loadError}</p>
            <button type="button" onClick={() => void loadDocuments()}>
              Retry
            </button>
          </div>
        ) : null}

        {!isLoading && !loadError && documents.length === 0 ? (
          <p className="muted">No documents yet. Create your first document.</p>
        ) : null}

        {!isLoading && !loadError && documents.length > 0 ? (
        <table className="doc-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Owner</th>
              <th>Updated</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => (
              <tr
                key={document.id}
                className="doc-row-clickable"
                onClick={() => openEditor(document.id)}
              >
                <td>{document.title}</td>
                <td>{document.owner}</td>
                <td>{document.lastUpdated}</td>
                <td>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEditor(document.id);
                    }}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        ) : null}
      </div>
    </section>
  );
}

export default Dashboard;
