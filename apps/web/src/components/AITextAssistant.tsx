import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useAuth } from "../hooks/useAuth";
import { authFetch } from "../lib/apiClient";
import TextSuggestionDiffPanel from "./TextSuggestionDiffPanel";

type AIFeature = "paraphrase" | "summarize";
type RequestState = "idle" | "streaming" | "saving";

interface SelectionSnapshot {
  from: number;
  to: number;
  text: string;
}

interface UndoSnapshot {
  content: string;
  version: number;
}

export interface AITextAssistantProps {
  documentId: string;
  editor: Editor;
  version: number;
  onVersionSaved: (savedContent: string, savedVersion: number) => void;
}

const MAX_CONTEXT_CHARS = 4000;
const CONTEXT_WINDOW = 2000;

function parseVersion(data: unknown): number | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const rawVersion = (data as { version?: unknown }).version;
  if (typeof rawVersion === "number" && Number.isFinite(rawVersion)) {
    return rawVersion;
  }
  if (typeof rawVersion === "string") {
    const parsed = Number(rawVersion);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail;
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

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Trim context sent to the LLM: if the document is long, only send a window
// around the selected text so the model isn't blind-fed thousands of chars.
function buildContextForParaphrase(
  fullHtml: string,
  selection: string
): string {
  if (fullHtml.length <= MAX_CONTEXT_CHARS) {
    return fullHtml;
  }
  const plain = stripHtml(fullHtml);
  const idx = plain.indexOf(selection);
  if (idx < 0) {
    return plain.slice(0, MAX_CONTEXT_CHARS);
  }
  const start = Math.max(0, idx - CONTEXT_WINDOW);
  const end = Math.min(plain.length, idx + selection.length + CONTEXT_WINDOW);
  return plain.slice(start, end);
}

function featureLabel(feature: AIFeature): string {
  return feature === "paraphrase" ? "Paraphrase" : "Summarize";
}

function AITextAssistant({
  documentId,
  editor,
  version,
  onVersionSaved,
}: AITextAssistantProps) {
  const auth = useAuth();
  const { logout } = auth;
  const selectionRef = useRef<SelectionSnapshot | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [activeFeature, setActiveFeature] = useState<AIFeature | null>(null);
  const [suggestion, setSuggestion] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  // Stack of pre-acceptance snapshots so every accepted AI change can be
  // undone, not just the most recent. Reset only on doc reload / unmount.
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);

  const hasSuggestion = suggestion.trim().length > 0;
  const isBusy = requestState !== "idle";
  const isStreaming = requestState === "streaming";

  const streamStatus = useMemo(() => {
    if (requestState === "streaming") {
      return `Generating ${activeFeature ?? "suggestion"}...`;
    }
    if (requestState === "saving") {
      return "Applying suggestion...";
    }
    return null;
  }, [activeFeature, requestState]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const runFeature = async (feature: AIFeature) => {
    const { from, to } = editor.state.selection;
    const currentSelection = editor.state.doc.textBetween(from, to, " ").trim();

    if (!currentSelection) {
      setError("Select text in the editor before requesting AI assistance.");
      return;
    }

    selectionRef.current = { from, to, text: currentSelection };

    setError(null);
    setStatusMessage(null);
    setSuggestion("");
    setSelectedText(currentSelection);
    setActiveFeature(feature);
    setRequestState("streaming");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const body =
      feature === "paraphrase"
        ? {
            text: currentSelection,
            content: buildContextForParaphrase(
              editor.getHTML(),
              currentSelection
            ),
            version,
          }
        : { text: currentSelection };

    try {
      const response = await authFetch(
        `/documents/${documentId}/ai/${feature}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
        auth
      );

      if (response.status === 401) {
        setError("Session expired. Please log in again.");
        logout();
        return;
      }

      if (!response.ok) {
        const responseData: unknown = await response
          .json()
          .catch(() => undefined as unknown);
        throw new Error(
          parseErrorMessage(responseData) ??
            `${featureLabel(feature)} request failed. Please try again.`
        );
      }

      if (!response.body) {
        const fullText = await response.text();
        setSuggestion(fullText);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamDone = false;

      while (!streamDone) {
        const { value, done } = await reader.read();
        streamDone = done;

        if (value) {
          const chunk = decoder.decode(value, { stream: !done });
          setSuggestion((previous) => previous + chunk);
        }
      }
    } catch (caughtError) {
      if (
        caughtError instanceof DOMException &&
        caughtError.name === "AbortError"
      ) {
        setSuggestion("");
        setSelectedText("");
        selectionRef.current = null;
        setStatusMessage("Generation cancelled.");
      } else {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : `${featureLabel(feature)} request failed.`
        );
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setRequestState((state) => (state === "streaming" ? "idle" : state));
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleReject = () => {
    setSuggestion("");
    setSelectedText("");
    setError(null);
    setStatusMessage(null);
    setActiveFeature(null);
    setIsEditing(false);
    setEditDraft("");
    selectionRef.current = null;
  };

  const handleStartEdit = () => {
    setEditDraft(suggestion);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    setSuggestion(editDraft);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditDraft("");
  };

  const persistContent = async (
    nextContent: string,
    baseVersion: number
  ): Promise<number | null> => {
    const attempt = async (version: number) =>
      authFetch(
        `/documents/${documentId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: nextContent, version }),
        },
        auth
      );

    let response = await attempt(baseVersion);

    // OCC self-heal: when a peer's REST autosave bumps the server version
    // between our AI stream start and Accept click, retry once against
    // the latest version the server just reported.
    if (response.status === 409) {
      const conflictData: unknown = await response
        .json()
        .catch(() => undefined as unknown);
      const detail = (conflictData as { detail?: unknown } | null)?.detail;
      const latestVersion =
        detail && typeof detail === "object"
          ? (detail as { latest_version?: unknown }).latest_version
          : undefined;
      if (typeof latestVersion === "number" && latestVersion !== baseVersion) {
        response = await attempt(latestVersion);
      }
    }

    const responseData: unknown = await response
      .json()
      .catch(() => undefined as unknown);

    if (response.status === 401) {
      setError("Session expired. Please log in again.");
      logout();
      return null;
    }

    if (!response.ok) {
      throw new Error(
        parseErrorMessage(responseData) ??
          "Failed to persist AI change."
      );
    }

    return parseVersion(responseData) ?? baseVersion + 1;
  };

  const handleAccept = async (replacementText: string) => {
    const selection = selectionRef.current;
    if (!selection) {
      setError("Selection is no longer available. Please request again.");
      return;
    }

    const nextText = replacementText.trim();
    if (!nextText) {
      setError("Suggestion is empty.");
      return;
    }

    setError(null);
    setStatusMessage(null);
    setRequestState("saving");

    const previousSnapshot: UndoSnapshot = {
      content: editor.getHTML(),
      version,
    };

    const replacementApplied = editor
      .chain()
      .focus()
      .setTextSelection({ from: selection.from, to: selection.to })
      .insertContent(nextText)
      .run();

    if (!replacementApplied) {
      setRequestState("idle");
      setError("Failed to replace selected text. Please try again.");
      return;
    }

    const updatedContent = editor.getHTML();

    try {
      const nextVersion = await persistContent(updatedContent, version);
      if (nextVersion === null) {
        return;
      }

      onVersionSaved(updatedContent, nextVersion);
      setSuggestion("");
      setSelectedText("");
      setActiveFeature(null);
      selectionRef.current = null;

      setUndoStack((stack) => [...stack, previousSnapshot]);
      setStatusMessage("AI change applied. Undo available.");
    } catch (caughtError) {
      // Roll the editor back so the UI matches what was persisted.
      editor.commands.setContent(previousSnapshot.content, false);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to persist AI change."
      );
    } finally {
      setRequestState((state) => (state === "saving" ? "idle" : state));
    }
  };

  const handleUndo = async () => {
    const snapshot = undoStack[undoStack.length - 1];
    if (!snapshot) {
      return;
    }

    setError(null);
    setStatusMessage(null);
    setRequestState("saving");

    try {
      editor.commands.setContent(snapshot.content, false);
      const nextVersion = await persistContent(snapshot.content, version);
      if (nextVersion === null) {
        return;
      }
      onVersionSaved(snapshot.content, nextVersion);
      // Pop only on success; a 409 or network error leaves the stack intact
      // so the user can retry.
      setUndoStack((stack) => stack.slice(0, -1));
      setStatusMessage("AI change reverted.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to undo AI change."
      );
    } finally {
      setRequestState((state) => (state === "saving" ? "idle" : state));
    }
  };

  return (
    <section className="ai-assistant">
      <div className="ai-assistant-header">
        <h3>AI Text Assistance</h3>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void runFeature("paraphrase")}
            disabled={isBusy}
          >
            Paraphrase Selection
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => void runFeature("summarize")}
            disabled={isBusy}
          >
            Summarize Selection
          </button>
        </div>
      </div>

      {selectedText ? (
        <p className="ai-selection-preview">
          Selected: <span>{selectedText}</span>
        </p>
      ) : (
        <p className="muted">
          Select text in the editor to request a paraphrase or summary.
        </p>
      )}

      {streamStatus ? <p className="muted">{streamStatus}</p> : null}
      {statusMessage ? <p className="muted">{statusMessage}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {isStreaming ? (
        <div className="ai-suggestion-panel">
          <label className="field-label">Streaming suggestion</label>
          <pre
            className="ai-suggestion-input"
            style={{ whiteSpace: "pre-wrap", margin: 0 }}
          >
            {suggestion || " "}
          </pre>
          <div className="ai-suggestion-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {!isStreaming && hasSuggestion && !isEditing ? (
        <div>
          <TextSuggestionDiffPanel
            originalText={selectedText}
            suggestedText={suggestion}
            onAccept={(replacement) => void handleAccept(replacement)}
            onReject={handleReject}
          />
          <div className="ai-suggestion-actions" style={{ marginTop: "0.5rem" }}>
            <button
              type="button"
              className="button-secondary"
              onClick={handleStartEdit}
              disabled={isBusy}
            >
              Edit suggestion
            </button>
          </div>
        </div>
      ) : null}

      {!isStreaming && isEditing ? (
        <div className="ai-suggestion-panel">
          <label className="field-label" htmlFor="ai-suggestion-edit">
            Edit suggestion before applying
          </label>
          <textarea
            id="ai-suggestion-edit"
            className="ai-suggestion-input"
            value={editDraft}
            onChange={(event) => setEditDraft(event.target.value)}
            rows={6}
          />
          <div className="ai-suggestion-actions">
            <button type="button" onClick={handleSaveEdit}>
              Save edits
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={handleCancelEdit}
            >
              Cancel edit
            </button>
          </div>
        </div>
      ) : null}

      {undoStack.length > 0 && !isBusy ? (
        <div className="ai-suggestion-actions" style={{ marginTop: "0.5rem" }}>
          <button
            type="button"
            className="button-secondary"
            onClick={() => void handleUndo()}
          >
            Undo AI change
            {undoStack.length > 1 ? ` (${undoStack.length} left)` : ""}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default AITextAssistant;
