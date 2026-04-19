import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useAuth } from "../hooks/useAuth";
import { useDocumentWebSocket } from "../hooks/useDocumentWebSocket";
import { authFetch } from "../lib/apiClient";
import AITextAssistant from "./AITextAssistant";
import PresenceIndicator from "./PresenceIndicator";

export interface DocumentEditorProps {
  documentId: string;
  initialContent: string;
  version: number;
  readOnly?: boolean;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";
type LatestSnapshot = {
  content: string;
  version: number;
};

function getErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const message = (data as { message?: unknown }).message;
  if (typeof message === "string" && message.trim().length > 0) {
    return message;
  }

  const error = (data as { error?: unknown }).error;
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return null;
}

function parseResponseVersion(data: unknown): number | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const rawVersion = (data as { version?: unknown }).version;

  if (typeof rawVersion === "number") {
    return Number.isFinite(rawVersion) ? rawVersion : null;
  }

  if (typeof rawVersion === "string") {
    const parsed = Number(rawVersion);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseSnapshot(data: unknown): LatestSnapshot | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const rawContent = (data as { content?: unknown }).content;
  if (typeof rawContent !== "string") {
    return null;
  }

  const rawVersion = (data as { version?: unknown }).version;
  if (typeof rawVersion === "number" && Number.isFinite(rawVersion)) {
    return {
      content: rawContent,
      version: rawVersion,
    };
  }

  if (typeof rawVersion === "string") {
    const parsedVersion = Number(rawVersion);
    if (Number.isFinite(parsedVersion)) {
      return {
        content: rawContent,
        version: parsedVersion,
      };
    }
  }

  return null;
}

function parseLatestSnapshot(data: unknown): LatestSnapshot | null {
  const direct = parseSnapshot(data);
  if (direct) {
    return direct;
  }

  if (!data || typeof data !== "object") {
    return null;
  }

  const container = data as {
    latest?: unknown;
    document?: unknown;
    data?: unknown;
  };

  return (
    parseSnapshot(container.latest) ??
    parseSnapshot(container.document) ??
    parseSnapshot(container.data)
  );
}

function DocumentEditor({ documentId, initialContent, version, readOnly = false }: DocumentEditorProps) {
  const auth = useAuth();
  const { accessToken, logout } = auth;
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const [content, setContent] = useState(initialContent);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState(version);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [isReloadingLatest, setIsReloadingLatest] = useState(false);
  const [conflictSnapshot, setConflictSnapshot] = useState<LatestSnapshot | null>(
    null
  );

  const saveTimeoutRef = useRef<number | null>(null);
  const wsThrottleRef = useRef<number | null>(null);
  const lastSavedContentRef = useRef(initialContent);
  const versionRef = useRef(version);

  const {
    content: wsContent,
    version: wsVersion,
    presence,
    typingUserIds,
    isConnected,
    connectionState: wsConnectionState,
    lastError: wsLastError,
    reconnect: wsReconnect,
    sendMessage,
    sendTyping,
  } = useDocumentWebSocket(documentId, accessToken, auth.refresh);

  const lastTypingSignalRef = useRef(0);
  const typingStopTimeoutRef = useRef<number | null>(null);

  const signalTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSignalRef.current > 2000) {
      sendTyping(true);
      lastTypingSignalRef.current = now;
    }
    if (typingStopTimeoutRef.current !== null) {
      window.clearTimeout(typingStopTimeoutRef.current);
    }
    typingStopTimeoutRef.current = window.setTimeout(() => {
      sendTyping(false);
      lastTypingSignalRef.current = 0;
      typingStopTimeoutRef.current = null;
    }, 3000);
  }, [sendTyping]);

  useEffect(() => {
    return () => {
      if (typingStopTimeoutRef.current !== null) {
        window.clearTimeout(typingStopTimeoutRef.current);
      }
    };
  }, []);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    editable: !readOnly,
    onUpdate: ({ editor: tiptapEditor }) => {
      if (readOnly) {
        return;
      }
      const nextContent = tiptapEditor.getHTML();
      setContent(nextContent);
      setSaveStatus("idle");
      setSaveError(null);
      signalTyping();
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    versionRef.current = version;
    setCurrentVersion(version);
  }, [version]);

  useEffect(() => {
    lastSavedContentRef.current = initialContent;
    setContent(initialContent);
    setSaveStatus("saved");
    setSaveError(null);
    setIsConflictModalOpen(false);
    setConflictSnapshot(null);

    if (editor && editor.getHTML() !== initialContent) {
      editor.commands.setContent(initialContent, false);
    }
  }, [documentId, editor, initialContent]);

  // Apply content that arrived from another user via WebSocket.
  // Live-sync updates carry the same version (they don't bump the
  // snapshot counter), so we apply as long as the version hasn't
  // regressed. The content-equality check below dedupes our own echo.
  useEffect(() => {
    if (wsContent === null || wsVersion === null) {
      return;
    }
    if (wsVersion < versionRef.current) {
      return;
    }
    versionRef.current = wsVersion;
    setCurrentVersion(wsVersion);
    lastSavedContentRef.current = wsContent;
    setContent(wsContent);
    if (editor && editor.getHTML() !== wsContent) {
      editor.commands.setContent(wsContent, false);
    }
  }, [editor, wsContent, wsVersion]);

  const applyLatestSnapshot = useCallback(
    (snapshot: LatestSnapshot) => {
      versionRef.current = snapshot.version;
      setCurrentVersion(snapshot.version);
      lastSavedContentRef.current = snapshot.content;
      setContent(snapshot.content);
      setSaveStatus("saved");
      setSaveError(null);
      setIsConflictModalOpen(false);
      setConflictSnapshot(null);

      if (editor && editor.getHTML() !== snapshot.content) {
        editor.commands.setContent(snapshot.content, false);
      }
    },
    [editor]
  );

  const saveDocument = useCallback(
    async (nextContent: string) => {
      setSaveStatus("saving");
      setSaveError(null);

      try {
        const response = await authFetch(
          `/documents/${documentId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: nextContent,
              version: versionRef.current,
            }),
          },
          auth
        );

        const responseData: unknown = await response
          .json()
          .catch(() => undefined as unknown);

        if (response.status === 401) {
          setSaveStatus("error");
          setSaveError("Session expired. Please log in again.");
          logout();
          return;
        }

        if (response.status === 409) {
          setConflictSnapshot(parseLatestSnapshot(responseData));
          setSaveStatus("error");
          setSaveError("Document updated by another user.");
          setIsConflictModalOpen(true);
          return;
        }

        if (!response.ok) {
          throw new Error(
            getErrorMessage(responseData) ?? "Failed to save document."
          );
        }

        const returnedVersion = parseResponseVersion(responseData);
        const nextVersion =
          returnedVersion ?? Math.max(versionRef.current + 1, versionRef.current);

        versionRef.current = nextVersion;
        setCurrentVersion(nextVersion);
        lastSavedContentRef.current = nextContent;
        setSaveStatus("saved");
      } catch (caughtError) {
        setSaveStatus("error");
        setSaveError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to save document."
        );
      }
    },
    [auth, documentId, logout]
  );

  const reloadLatestVersion = useCallback(async () => {
    setIsReloadingLatest(true);
    setSaveError(null);

    try {
      const response = await authFetch(
        `/documents/${documentId}`,
        { method: "GET" },
        auth
      );

      const responseData: unknown = await response
        .json()
        .catch(() => undefined as unknown);

      if (response.status === 401) {
        setSaveStatus("error");
        setSaveError("Session expired. Please log in again.");
        logout();
        return;
      }

      if (!response.ok) {
        throw new Error(
          getErrorMessage(responseData) ??
            "Failed to reload latest document version."
        );
      }

      const latestSnapshot =
        parseLatestSnapshot(responseData) ?? conflictSnapshot;

      if (!latestSnapshot) {
        throw new Error("Latest document payload is invalid.");
      }

      applyLatestSnapshot(latestSnapshot);
    } catch (caughtError) {
      setSaveStatus("error");
      setSaveError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to reload latest document version."
      );
    } finally {
      setIsReloadingLatest(false);
    }
  }, [applyLatestSnapshot, auth, conflictSnapshot, documentId, logout]);

  useEffect(() => {
    if (!editor || readOnly) {
      return;
    }

    const hasUnsavedChanges = content !== lastSavedContentRef.current;
    if (!hasUnsavedChanges) {
      return;
    }

    // Throttled WS broadcast so other users see keystrokes in near real-time.
    if (isConnected) {
      if (wsThrottleRef.current !== null) {
        window.clearTimeout(wsThrottleRef.current);
      }
      wsThrottleRef.current = window.setTimeout(() => {
        sendMessage({
          type: "document_update",
          content,
          version: versionRef.current,
        });
        wsThrottleRef.current = null;
      }, 150);
    }

    // REST auto-save after 5s of inactivity (creates a version history
    // entry). Debounced: every keystroke resets the timer so we don't spam
    // versions on every character.
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      void saveDocument(content);
      saveTimeoutRef.current = null;
    }, 5000);

    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      if (wsThrottleRef.current !== null) {
        window.clearTimeout(wsThrottleRef.current);
      }
    };
  }, [content, editor, isConnected, readOnly, saveDocument, sendMessage]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      if (content !== lastSavedContentRef.current) {
        void saveDocument(content);
      }
    };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [content, saveDocument]);

  if (!editor) {
    return <p className="muted">Loading editor...</p>;
  }

  return (
    <div className="editor-form">
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
        {readOnly ? (
          <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            Read-only • viewer access
          </div>
        ) : null}
        {isOffline ? (
          <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            Offline — changes will sync when reconnected
          </div>
        ) : null}
        <PresenceIndicator
          users={presence}
          typingUserIds={typingUserIds}
          connectionState={wsConnectionState}
          lastError={wsLastError}
          onReconnect={wsReconnect}
        />
      </div>

      <div className="editor-toolbar" role="toolbar" aria-label="Editor toolbar">
        <button
          type="button"
          className={editor.isActive("bold") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={readOnly || !editor.can().chain().focus().toggleBold().run()}
        >
          Bold
        </button>
        <button
          type="button"
          className={editor.isActive("italic") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={readOnly || !editor.can().chain().focus().toggleItalic().run()}
        >
          Italic
        </button>
        <button
          type="button"
          className={editor.isActive("heading", { level: 2 }) ? "active" : ""}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          disabled={readOnly}
        >
          Heading
        </button>
        <button
          type="button"
          className={editor.isActive("bulletList") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={readOnly}
        >
          Bullet List
        </button>
        <button
          type="button"
          className={editor.isActive("codeBlock") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          disabled={readOnly}
        >
          Code Block
        </button>
      </div>

      <EditorContent editor={editor} className="editor-surface" />

      {!readOnly ? (
        <AITextAssistant
          documentId={documentId}
          editor={editor}
          version={currentVersion}
          onVersionSaved={(savedContent, savedVersion) => {
            versionRef.current = savedVersion;
            setCurrentVersion(savedVersion);
            lastSavedContentRef.current = savedContent;
            setContent(savedContent);
          }}
        />
      ) : null}

      <div className="editor-footer">
        <div className="editor-status" aria-live="polite">
          {saveStatus === "idle" ? (
            <span className="save-indicator save-indicator-pending">
              <span className="save-dot" /> Unsaved changes…
            </span>
          ) : null}
          {saveStatus === "saving" ? (
            <span className="save-indicator save-indicator-saving">
              <span className="save-dot" /> Saving…
            </span>
          ) : null}
          {saveStatus === "saved" ? (
            <span className="save-indicator save-indicator-saved">
              <span className="save-dot" /> Saved
            </span>
          ) : null}
          {saveStatus === "error" ? (
            <span className="error-text">{saveError ?? "Failed to save document."}</span>
          ) : null}
        </div>
        <span className="muted">Version: {currentVersion}</span>
      </div>

      {isConflictModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Document updated by another user</h3>
            <p className="muted">
              Your version is out of date. Reload the latest version to continue
              saving.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => void reloadLatestVersion()}
                disabled={isReloadingLatest}
              >
                {isReloadingLatest ? "Reloading..." : "Reload latest version"}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setIsConflictModalOpen(false)}
                disabled={isReloadingLatest}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DocumentEditor;
