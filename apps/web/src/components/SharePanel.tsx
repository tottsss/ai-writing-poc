import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../hooks/useAuth";

type Role = "viewer" | "editor" | "owner";

interface PermissionRecord {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
}

export interface SharePanelProps {
  documentId: string;
  canManage: boolean;
}

function asObject(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
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

function parsePermission(data: unknown): PermissionRecord | null {
  const raw = asObject(data);
  if (!raw) {
    return null;
  }
  const id = raw.id;
  const userId = raw.user_id;
  const email = raw.email;
  const name = raw.name;
  const role = raw.role;
  if (
    typeof id !== "string" ||
    typeof userId !== "string" ||
    typeof email !== "string" ||
    typeof name !== "string" ||
    (role !== "viewer" && role !== "editor" && role !== "owner")
  ) {
    return null;
  }
  return { id, userId, email, name, role };
}

function SharePanel({ documentId, canManage }: SharePanelProps) {
  const { accessToken, logout } = useAuth();

  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    return headers;
  }, [accessToken]);

  const loadPermissions = useCallback(async () => {
    if (!documentId) {
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`/documents/${documentId}/permissions`, {
        headers: authHeaders(),
      });
      const body: unknown = await response.json().catch(() => undefined);
      if (response.status === 401) {
        logout();
        return;
      }
      if (!response.ok) {
        throw new Error(
          parseErrorMessage(body) ?? "Unable to load collaborators."
        );
      }
      const list = Array.isArray(body) ? body : [];
      setPermissions(
        list
          .map(parsePermission)
          .filter((record): record is PermissionRecord => record !== null)
      );
    } catch (caught) {
      setLoadError(
        caught instanceof Error ? caught.message : "Unable to load collaborators."
      );
    } finally {
      setIsLoading(false);
    }
  }, [authHeaders, documentId, logout]);

  useEffect(() => {
    void loadPermissions();
  }, [loadPermissions]);

  const handleShare = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setShareError("Email is required.");
      return;
    }

    setShareError(null);
    setShareSuccess(null);
    setIsSharing(true);

    try {
      const response = await fetch(`/documents/${documentId}/share`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: trimmed, role }),
      });

      const body: unknown = await response.json().catch(() => undefined);

      if (response.status === 401) {
        logout();
        return;
      }

      if (!response.ok) {
        throw new Error(
          parseErrorMessage(body) ?? "Unable to share document."
        );
      }

      setEmail("");
      setShareSuccess(`Shared with ${trimmed} as ${role}.`);
      await loadPermissions();
    } catch (caught) {
      setShareError(
        caught instanceof Error ? caught.message : "Unable to share document."
      );
    } finally {
      setIsSharing(false);
    }
  };

  const handleRevoke = async (record: PermissionRecord) => {
    const confirmed = window.confirm(
      `Revoke access for ${record.email}?`
    );
    if (!confirmed) {
      return;
    }

    setShareError(null);
    setShareSuccess(null);
    setRevokingUserId(record.userId);

    try {
      const response = await fetch(
        `/documents/${documentId}/permissions/${record.userId}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );

      if (response.status === 401) {
        logout();
        return;
      }

      if (response.status !== 204 && !response.ok) {
        const body: unknown = await response.json().catch(() => undefined);
        throw new Error(
          parseErrorMessage(body) ?? "Unable to revoke access."
        );
      }

      await loadPermissions();
    } catch (caught) {
      setShareError(
        caught instanceof Error ? caught.message : "Unable to revoke access."
      );
    } finally {
      setRevokingUserId(null);
    }
  };

  return (
    <section className="card">
      <div className="section-heading">
        <h3>Share</h3>
      </div>

      {canManage ? (
        <form className="stack" onSubmit={handleShare}>
          <label className="field-label" htmlFor="share-email">
            Email
          </label>
          <input
            id="share-email"
            type="email"
            value={email}
            onChange={(e) => {
              setShareError(null);
              setShareSuccess(null);
              setEmail(e.target.value);
            }}
            placeholder="collaborator@university.edu"
            required
          />

          <label className="field-label" htmlFor="share-role">
            Role
          </label>
          <select
            id="share-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>

          {shareError ? <p className="error-text">{shareError}</p> : null}
          {shareSuccess ? <p className="muted">{shareSuccess}</p> : null}

          <button type="submit" disabled={isSharing}>
            {isSharing ? "Sharing..." : "Share"}
          </button>
        </form>
      ) : (
        <p className="muted">Only the owner can manage sharing.</p>
      )}

      <div style={{ marginTop: "1rem" }}>
        <p className="field-label">People with access</p>
        {isLoading ? <p className="muted">Loading...</p> : null}
        {loadError ? <p className="error-text">{loadError}</p> : null}

        {!isLoading && !loadError && permissions.length === 0 ? (
          <p className="muted">No collaborators yet.</p>
        ) : null}

        {!isLoading && !loadError && permissions.length > 0 ? (
          <ul className="version-list">
            {permissions.map((record) => (
              <li key={record.id} className="version-item">
                <div className="version-meta">
                  <p className="version-label">
                    {record.name.trim().length > 0 ? record.name : record.email}
                  </p>
                  <p className="muted">
                    {record.email} • {record.role}
                  </p>
                </div>
                {canManage && record.role !== "owner" ? (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => void handleRevoke(record)}
                    disabled={revokingUserId === record.userId}
                  >
                    {revokingUserId === record.userId ? "Revoking..." : "Revoke"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

export default SharePanel;
