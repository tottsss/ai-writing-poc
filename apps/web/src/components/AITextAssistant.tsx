import { useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useAuth } from "../hooks/useAuth";

interface SelectionSnapshot {
  from: number;
  to: number;
  text: string;
}

type RequestState = "idle" | "streaming" | "saving";

export interface AITextAssistantProps {
  documentId: string;
  editor: Editor;
  version: number;
  onVersionSaved: (savedContent: string, savedVersion: number) => void;
}

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

function AITextAssistant({
  documentId,
  editor,
  version,
  onVersionSaved,
}: AITextAssistantProps) {
  const { accessToken, logout } = useAuth();
  const selectionRef = useRef<SelectionSnapshot | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [suggestion, setSuggestion] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hasSuggestion = suggestion.trim().length > 0;
  const isBusy = requestState !== "idle";

  const statusLabel = useMemo(() => {
    if (requestState === "streaming") {
      return "Generating suggestion...";
    }

    if (requestState === "saving") {
      return "Applying suggestion...";
    }

    return null;
  }, [requestState]);

  const handleParaphrase = async () => {
    const { from, to } = editor.state.selection;
    const currentSelection = editor.state.doc.textBetween(from, to, " ").trim();

    if (!currentSelection) {
      setError("Select text in the editor before requesting AI assistance.");
      return;
    }

    selectionRef.current = {
      from,
      to,
      text: currentSelection,
    };

    setError(null);
    setSuggestion("");
    setSelectedText(currentSelection);
    setRequestState("streaming");

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
      const response = await fetch(`/documents/${documentId}/ai/paraphrase`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: currentSelection,
          content: editor.getHTML(),
          version,
        }),
      });

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
            "AI paraphrase request failed. Please try again."
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
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "AI paraphrase request failed."
      );
    } finally {
      setRequestState("idle");
    }
  };

  const handleReject = () => {
    setSuggestion("");
    setSelectedText("");
    setError(null);
    selectionRef.current = null;
  };

  const handleAccept = async () => {
    const selection = selectionRef.current;

    if (!selection) {
      setError("Selection is no longer available. Please request again.");
      return;
    }

    const nextText = suggestion.trim();
    if (!nextText) {
      setError("Suggestion is empty. Generate or edit a suggestion first.");
      return;
    }

    setError(null);
    setRequestState("saving");

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
          content: updatedContent,
          version,
        }),
      });

      const responseData: unknown = await response
        .json()
        .catch(() => undefined as unknown);

      if (response.status === 401) {
        setError("Session expired. Please log in again.");
        logout();
        return;
      }

      if (!response.ok) {
        throw new Error(
          parseErrorMessage(responseData) ??
            "Failed to persist AI suggestion as a new version."
        );
      }

      const nextVersion = parseVersion(responseData) ?? version + 1;
      onVersionSaved(updatedContent, nextVersion);

      setSuggestion("");
      setSelectedText("");
      selectionRef.current = null;
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to persist AI suggestion as a new version."
      );
    } finally {
      setRequestState("idle");
    }
  };

  return (
    <section className="ai-assistant">
      <div className="ai-assistant-header">
        <h3>AI Text Assistance</h3>
        <button type="button" onClick={() => void handleParaphrase()} disabled={isBusy}>
          Paraphrase Selection
        </button>
      </div>

      {selectedText ? (
        <p className="ai-selection-preview">
          Selected: <span>{selectedText}</span>
        </p>
      ) : (
        <p className="muted">Select text in the editor to request a paraphrase.</p>
      )}

      {statusLabel ? <p className="muted">{statusLabel}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {hasSuggestion || requestState === "streaming" ? (
        <div className="ai-suggestion-panel">
          <label className="field-label" htmlFor="ai-suggestion">
            Suggestion
          </label>
          <textarea
            id="ai-suggestion"
            className="ai-suggestion-input"
            value={suggestion}
            onChange={(event) => setSuggestion(event.target.value)}
            placeholder="Streaming AI suggestion will appear here..."
            disabled={requestState === "streaming"}
          />
          <div className="ai-suggestion-actions">
            <button
              type="button"
              onClick={() => void handleAccept()}
              disabled={isBusy || suggestion.trim().length === 0}
            >
              Accept
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={handleReject}
              disabled={isBusy}
            >
              Reject
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default AITextAssistant;
