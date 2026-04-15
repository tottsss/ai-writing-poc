import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import AITextAssistant from "./AITextAssistant";
import { useAuth } from "../hooks/useAuth";

export interface DocumentEditorProps {
  documentId: string;
  initialContent: string;
  version: number;
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

function DocumentEditor({ documentId, initialContent, version }: DocumentEditorProps) {
  const { accessToken, logout } = useAuth();
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
  const lastSavedContentRef = useRef(initialContent);
  const versionRef = useRef(version);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    onUpdate: ({ editor: tiptapEditor }) => {
      const nextContent = tiptapEditor.getHTML();
      setContent(nextContent);
      setSaveStatus("idle");
      setSaveError(null);
    },
  });

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

  const handleVersionSaved = useCallback(
    (savedContent: string, savedVersion: number) => {
      versionRef.current = savedVersion;
      setCurrentVersion(savedVersion);
      lastSavedContentRef.current = savedContent;
      setContent(savedContent);
      setSaveStatus("saved");
      setSaveError(null);
      setIsConflictModalOpen(false);
      setConflictSnapshot(null);

      if (editor && editor.getHTML() !== savedContent) {
        editor.commands.setContent(savedContent, false);
      }
    },
    [editor]
  );

  const saveDocument = useCallback(
    async (nextContent: string) => {
      setSaveStatus("saving");
      setSaveError(null);

      let headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      if (accessToken) {
        headers = {
          ...headers,
          Authorization: `Bearer ${accessToken}`,
        };
      }

      try {
        const response = await fetch(`/documents/${documentId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            content: nextContent,
            version: versionRef.current,
          }),
        });

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
    [accessToken, documentId, logout]
  );

  const reloadLatestVersion = useCallback(async () => {
    setIsReloadingLatest(true);
    setSaveError(null);

    let headers: HeadersInit = {};
    if (accessToken) {
      headers = {
        Authorization: `Bearer ${accessToken}`,
      };
    }

    try {
      const response = await fetch(`/documents/${documentId}`, {
        method: "GET",
        headers,
      });

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
  }, [accessToken, applyLatestSnapshot, conflictSnapshot, documentId, logout]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const hasUnsavedChanges = content !== lastSavedContentRef.current;
    if (!hasUnsavedChanges) {
      return;
    }

    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      void saveDocument(content);
      saveTimeoutRef.current = null;
    }, 2000);

    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [content, editor, saveDocument]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (!editor) {
    return <p className="muted">Loading editor...</p>;
  }

  return (
    <div className="editor-form">
      <div className="editor-toolbar" role="toolbar" aria-label="Editor toolbar">
        <button
          type="button"
          className={editor.isActive("bold") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
        >
          Bold
        </button>
        <button
          type="button"
          className={editor.isActive("italic") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
        >
          Italic
        </button>
        <button
          type="button"
          className={editor.isActive("heading", { level: 2 }) ? "active" : ""}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          Heading
        </button>
        <button
          type="button"
          className={editor.isActive("bulletList") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          Bullet List
        </button>
      </div>

      <EditorContent editor={editor} className="editor-surface" />

      <AITextAssistant
        documentId={documentId}
        editor={editor}
        version={currentVersion}
        onVersionSaved={handleVersionSaved}
      />

      <div className="editor-footer">
        <div className="editor-status" aria-live="polite">
          {saveStatus === "saving" ? <span className="muted">Saving...</span> : null}
          {saveStatus === "saved" ? <span className="save-success">Saved</span> : null}
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
