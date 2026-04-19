import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { authFetch } from "../lib/apiClient";

export interface AIHistoryPanelProps {
  documentId: string;
  canManage: boolean;
}

interface AIInteractionRecord {
  id: number;
  feature: string;
  inputText: string;
  responseText: string;
  accepted: boolean | null;
}

function asObject(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function parseRecord(data: unknown): AIInteractionRecord | null {
  const raw = asObject(data);
  if (!raw) {
    return null;
  }
  const id = raw.id;
  const feature = raw.feature;
  const input = raw.input_text ?? raw.inputText;
  const response = raw.response_text ?? raw.responseText;
  const acceptedValue = raw.accepted;
  if (
    typeof id !== "number" ||
    typeof feature !== "string" ||
    typeof input !== "string" ||
    typeof response !== "string"
  ) {
    return null;
  }

  let accepted: boolean | null = null;
  if (typeof acceptedValue === "boolean") {
    accepted = acceptedValue;
  }

  return {
    id,
    feature,
    inputText: input,
    responseText: response,
    accepted,
  };
}

function parseErrorMessage(data: unknown): string | null {
  const payload = asObject(data);
  if (!payload) {
    return null;
  }
  const detail = payload.detail;
  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail;
  }
  return null;
}

function statusLabel(accepted: boolean | null): string {
  if (accepted === true) return "Accepted";
  if (accepted === false) return "Rejected";
  return "Pending";
}

function statusClass(accepted: boolean | null): string {
  if (accepted === true) return "ai-history-status accepted";
  if (accepted === false) return "ai-history-status rejected";
  return "ai-history-status pending";
}

function truncate(text: string, max = 120): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}...`;
}

function AIHistoryPanel({ documentId, canManage }: AIHistoryPanelProps) {
  const auth = useAuth();
  const { logout } = auth;

  const [records, setRecords] = useState<AIInteractionRecord[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!documentId) {
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const response = await authFetch(
        `/documents/${documentId}/ai/history`,
        { method: "GET" },
        auth
      );

      if (response.status === 401) {
        logout();
        return;
      }

      const body: unknown = await response.json().catch(() => undefined);

      if (!response.ok) {
        throw new Error(
          parseErrorMessage(body) ?? "Unable to load AI history."
        );
      }

      const list = Array.isArray(body) ? body : [];
      setRecords(
        list
          .map(parseRecord)
          .filter((record): record is AIInteractionRecord => record !== null)
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load AI history."
      );
    } finally {
      setIsLoading(false);
    }
  }, [auth, documentId, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpdate = async (record: AIInteractionRecord, accepted: boolean) => {
    setUpdatingId(record.id);
    setError(null);
    try {
      const response = await authFetch(
        `/documents/${documentId}/ai/history/${record.id}?accepted=${accepted}`,
        { method: "PATCH" },
        auth
      );

      if (response.status === 401) {
        logout();
        return;
      }

      const body: unknown = await response.json().catch(() => undefined);

      if (!response.ok) {
        throw new Error(
          parseErrorMessage(body) ?? "Unable to update interaction."
        );
      }

      setRecords((prev) =>
        prev.map((item) =>
          item.id === record.id ? { ...item, accepted } : item
        )
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update interaction."
      );
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className="card ai-history-panel">
      <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>AI History</h3>
        <button
          type="button"
          className="button-secondary"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      {isLoading ? <p className="muted">Loading history...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {!isLoading && !error && records.length === 0 ? (
        <p className="muted">No AI interactions yet.</p>
      ) : null}

      {!isLoading && !error && records.length > 0 ? (
        <ul className="ai-history-list">
          {records.map((record) => {
            const isExpanded = expandedId === record.id;
            return (
              <li key={record.id} className="ai-history-item">
                <div
                  className="ai-history-row"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : record.id)
                  }
                >
                  <div>
                    <p className="version-label">
                      {record.feature}{" "}
                      <span className={statusClass(record.accepted)}>
                        {statusLabel(record.accepted)}
                      </span>
                    </p>
                    <p className="muted">{truncate(record.inputText)}</p>
                  </div>
                </div>

                {isExpanded ? (
                  <div className="ai-history-detail">
                    <p className="field-label">Input</p>
                    <p className="ai-history-text">{record.inputText}</p>
                    <p className="field-label">Response</p>
                    <p className="ai-history-text">{record.responseText}</p>
                    {canManage && record.accepted === null ? (
                      <div className="ai-suggestion-actions">
                        <button
                          type="button"
                          onClick={() => void handleUpdate(record, true)}
                          disabled={updatingId === record.id}
                        >
                          {updatingId === record.id ? "Saving..." : "Mark Accepted"}
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => void handleUpdate(record, false)}
                          disabled={updatingId === record.id}
                        >
                          Mark Rejected
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export default AIHistoryPanel;
