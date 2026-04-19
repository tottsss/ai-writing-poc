import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { authFetch } from "../lib/apiClient";

interface VersionRecord {
  id: string;
  version: number;
  timestamp: string;
  author: string;
}

interface RawVersionRecord {
  id?: unknown;
  version?: unknown;
  timestamp?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  author?: unknown;
  authorName?: unknown;
  user?: unknown;
}

export interface VersionHistoryProps {
  documentId: string;
  canRestore?: boolean;
  onRestoreSuccess?: (restoredVersion: number) => void;
}

function asObject(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  return data as Record<string, unknown>;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseErrorMessage(data: unknown): string | null {
  const payload = asObject(data);
  if (!payload) {
    return null;
  }

  const message = payload.message;
  if (typeof message === "string" && message.trim().length > 0) {
    return message;
  }

  const error = payload.error;
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return null;
}

function parseVersionRecord(record: unknown): VersionRecord | null {
  const raw = asObject(record) as RawVersionRecord | null;
  if (!raw) {
    return null;
  }

  const version = parseNumber(raw.version);
  if (version === null) {
    return null;
  }

  const timestampValue = raw.timestamp ?? raw.createdAt ?? raw.updatedAt;
  if (typeof timestampValue !== "string" || timestampValue.trim().length === 0) {
    return null;
  }

  const authorValue = raw.author ?? raw.authorName ?? raw.user;
  const author = typeof authorValue === "string" && authorValue.trim().length > 0
    ? authorValue
    : "Unknown author";

  const idValue = raw.id;
  const id =
    typeof idValue === "string" && idValue.trim().length > 0
      ? idValue
      : `version-${version}`;

  return {
    id,
    version,
    timestamp: timestampValue,
    author,
  };
}

function parseVersionsResponse(data: unknown): VersionRecord[] {
  if (Array.isArray(data)) {
    return data
      .map((record) => parseVersionRecord(record))
      .filter((record): record is VersionRecord => record !== null);
  }

  const payload = asObject(data);
  if (!payload) {
    return [];
  }

  const possibleVersions = payload.versions ?? payload.data;
  if (!Array.isArray(possibleVersions)) {
    return [];
  }

  return possibleVersions
    .map((record) => parseVersionRecord(record))
    .filter((record): record is VersionRecord => record !== null);
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getTimestampValue(timestamp: string): number {
  const dateValue = new Date(timestamp).getTime();
  return Number.isNaN(dateValue) ? 0 : dateValue;
}

function VersionHistory({
  documentId,
  canRestore = true,
  onRestoreSuccess,
}: VersionHistoryProps) {
  const auth = useAuth();
  const { logout } = auth;
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  const sortedVersions = useMemo(
    () =>
      versions
        .slice()
        .sort(
          (leftVersion, rightVersion) =>
            getTimestampValue(leftVersion.timestamp) -
            getTimestampValue(rightVersion.timestamp)
        ),
    [versions]
  );

  const loadVersions = useCallback(async () => {
    if (!documentId) {
      setVersions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await authFetch(
        `/documents/${documentId}/versions`,
        { method: "GET" },
        auth
      );

      const responseData: unknown = await response
        .json()
        .catch(() => undefined as unknown);

      if (response.status === 401) {
        logout();
        return;
      }

      if (!response.ok) {
        throw new Error(
          parseErrorMessage(responseData) ??
            "Unable to load version history. Please try again."
        );
      }

      setVersions(parseVersionsResponse(responseData));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load version history."
      );
    } finally {
      setIsLoading(false);
    }
  }, [auth, documentId, logout]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  const handleRestore = async (record: VersionRecord) => {
    const confirmed = window.confirm(
      `Restore version ${record.version} by ${record.author}?`
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setRestoringVersion(record.version);

    try {
      const versionIdNumeric = Number(record.id);
      if (!Number.isFinite(versionIdNumeric) || versionIdNumeric < 1) {
        throw new Error("Invalid version id.");
      }

      const response = await authFetch(
        `/documents/${documentId}/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version_id: versionIdNumeric }),
        },
        auth
      );

      const responseData: unknown = await response
        .json()
        .catch(() => undefined as unknown);

      if (response.status === 401) {
        logout();
        return;
      }

      if (!response.ok) {
        throw new Error(
          parseErrorMessage(responseData) ??
            "Unable to restore version. Please try again."
        );
      }

      if (onRestoreSuccess) {
        onRestoreSuccess(record.version);
      }

      await loadVersions();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to restore version."
      );
    } finally {
      setRestoringVersion(null);
    }
  };

  return (
    <section className="card version-history">
      <div className="version-history-header">
        <h3>Version History</h3>
        <button type="button" className="button-secondary" onClick={() => void loadVersions()}>
          Refresh
        </button>
      </div>

      {isLoading ? <p className="muted">Loading versions...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {!isLoading && !error && sortedVersions.length === 0 ? (
        <p className="muted">No versions available.</p>
      ) : null}

      {!isLoading && !error && sortedVersions.length > 0 ? (
        <ul className="version-list">
          {sortedVersions.map((record) => (
            <li key={record.id} className="version-item">
              <div className="version-meta">
                <p className="version-label">Version {record.version}</p>
                <p className="muted">
                  {formatTimestamp(record.timestamp)} • {record.author}
                </p>
              </div>
              {canRestore ? (
                <button
                  type="button"
                  onClick={() => void handleRestore(record)}
                  disabled={restoringVersion === record.version}
                >
                  {restoringVersion === record.version
                    ? "Restoring..."
                    : "Restore"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default VersionHistory;
