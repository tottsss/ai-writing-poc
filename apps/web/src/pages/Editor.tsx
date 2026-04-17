import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DocumentEditor from "../components/DocumentEditor";
import VersionHistory from "../components/VersionHistory";
import { useAuth } from "../hooks/useAuth";

type LoadedDocument = {
  content: string;
  version: number;
  title: string;
};

function parseErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail;
  }
  return null;
}

function parseDocument(data: unknown): LoadedDocument | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const content = (data as { content?: unknown }).content;
  const version = (data as { version?: unknown }).version;
  const title = (data as { title?: unknown }).title;
  if (typeof content !== "string" || typeof version !== "number" || typeof title !== "string") {
    return null;
  }
  return { content, version, title };
}

function Editor() {
  const { id } = useParams<{ id: string }>();
  const documentId = id ?? "";
  const { accessToken, logout } = useAuth();

  const [document, setDocument] = useState<LoadedDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDocument = useCallback(async () => {
    if (!documentId) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    const headers: Record<string, string> = {};
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    try {
      const response = await fetch(`/documents/${documentId}`, {
        method: "GET",
        headers,
      });

      const body: unknown = await response.json().catch(() => undefined);

      if (response.status === 401) {
        logout();
        return;
      }

      if (!response.ok) {
        throw new Error(
          parseErrorMessage(body) ?? "Unable to load document."
        );
      }

      const parsed = parseDocument(body);
      if (!parsed) {
        throw new Error("Invalid document response from server.");
      }

      setDocument(parsed);
    } catch (caught) {
      setLoadError(
        caught instanceof Error ? caught.message : "Unable to load document."
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, documentId, logout]);

  useEffect(() => {
    void loadDocument();
  }, [loadDocument]);

  if (!documentId) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Editor</h2>
        <p className="mt-2 text-sm text-rose-600">Missing document ID.</p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            Active Draft
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {document?.title ?? `Document ${documentId}`}
          </h2>
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          Autosave enabled
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          {isLoading ? (
            <p className="muted">Loading document...</p>
          ) : loadError ? (
            <div>
              <p className="error-text">{loadError}</p>
              <button type="button" onClick={() => void loadDocument()}>
                Retry
              </button>
            </div>
          ) : document ? (
            <DocumentEditor
              key={documentId}
              documentId={documentId}
              initialContent={document.content}
              version={document.version}
            />
          ) : null}
        </div>

        <aside className="space-y-4">
          <VersionHistory
            documentId={documentId}
            onRestoreSuccess={() => {
              void loadDocument();
            }}
          />
        </aside>
      </div>
    </section>
  );
}

export default Editor;
