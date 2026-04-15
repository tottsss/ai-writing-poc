import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import DocumentEditor from "../components/DocumentEditor";
import PresenceIndicator from "../components/PresenceIndicator";
import VersionHistory from "../components/VersionHistory";
import { useDocumentWebSocket } from "../hooks/useDocumentWebSocket";

function Editor() {
  const { id } = useParams<{ id: string }>();
  const documentId = id ?? "";

  const fallbackInitialContent = useMemo(
    () =>
      `<p><strong>Document ${documentId}</strong></p><p>Write your academic draft here and your changes will auto-save.</p>`,
    [documentId]
  );
  const [editorContent, setEditorContent] = useState(fallbackInitialContent);
  const [editorVersion, setEditorVersion] = useState(1);

  const {
    content: liveContent,
    version: liveVersion,
    presence,
    connectionState,
    lastError,
    reconnect,
  } = useDocumentWebSocket(documentId);

  useEffect(() => {
    setEditorContent(fallbackInitialContent);
    setEditorVersion(1);
  }, [documentId, fallbackInitialContent]);

  useEffect(() => {
    if (!liveContent || liveVersion === null) {
      return;
    }

    if (liveVersion <= editorVersion) {
      return;
    }

    setEditorContent(liveContent);
    setEditorVersion(liveVersion);
  }, [editorVersion, liveContent, liveVersion]);

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
            Document {documentId}
          </h2>
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          Autosave enabled
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <DocumentEditor
            documentId={documentId}
            initialContent={editorContent}
            version={editorVersion}
          />
        </div>

        <aside className="space-y-4">
          <PresenceIndicator
            users={presence}
            connectionState={connectionState}
            lastError={lastError}
            onReconnect={reconnect}
          />
          <VersionHistory
            documentId={documentId}
            onRestoreSuccess={(restoredVersion) => {
              setEditorVersion((currentVersion) =>
                restoredVersion > currentVersion ? restoredVersion : currentVersion
              );
            }}
          />
        </aside>
      </div>
    </section>
  );
}

export default Editor;
