import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../hooks/useAuth";
import { authFetch } from "../lib/apiClient";

type Role = "viewer" | "editor" | "owner";
type ShareRole = "viewer" | "editor";
type ExpiryChoice = "24" | "168" | "never";

interface PermissionRecord {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
}

interface ShareLinkRecord {
  id: string;
  token: string;
  role: ShareRole;
  revoked: boolean;
  expiresAt: string | null;
}

function parseShareLink(data: unknown): ShareLinkRecord | null {
  const raw = asObject(data);
  if (!raw) return null;
  const id = raw.id;
  const token = raw.token;
  const role = raw.role;
  const revoked = raw.revoked;
  const expiresAt = raw.expires_at;
  if (
    typeof id !== "string" ||
    typeof token !== "string" ||
    (role !== "viewer" && role !== "editor") ||
    typeof revoked !== "boolean" ||
    (expiresAt !== null && typeof expiresAt !== "string")
  ) {
    return null;
  }
  return { id, token, role, revoked, expiresAt };
}

function formatExpiry(expiresAt: string | null): string {
  if (expiresAt === null) return "Never expires";
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  const now = new Date();
  if (date < now) return `Expired ${date.toLocaleString()}`;
  return `Expires ${date.toLocaleString()}`;
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
  const auth = useAuth();
  const { logout } = auth;

  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null);

  const [shareLinks, setShareLinks] = useState<ShareLinkRecord[]>([]);
  const [linkRole, setLinkRole] = useState<ShareRole>("editor");
  const [linkExpiry, setLinkExpiry] = useState<ExpiryChoice>("168");
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);

  const loadPermissions = useCallback(async () => {
    if (!documentId) {
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await authFetch(
        `/documents/${documentId}/permissions`,
        { method: "GET" },
        auth
      );
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
  }, [auth, documentId, logout]);

  const loadShareLinks = useCallback(async () => {
    if (!documentId || !canManage) return;
    try {
      const response = await authFetch(
        `/documents/${documentId}/share-links`,
        { method: "GET" },
        auth
      );
      const body: unknown = await response.json().catch(() => undefined);
      if (response.status === 401) {
        logout();
        return;
      }
      if (!response.ok) return;
      const list = Array.isArray(body) ? body : [];
      setShareLinks(
        list
          .map(parseShareLink)
          .filter((r): r is ShareLinkRecord => r !== null)
      );
    } catch {
      // Non-fatal; share links are a bonus feature.
    }
  }, [auth, canManage, documentId, logout]);

  useEffect(() => {
    void loadPermissions();
    void loadShareLinks();
  }, [loadPermissions, loadShareLinks]);

  const handleCreateLink = async () => {
    setLinkError(null);
    setIsCreatingLink(true);
    try {
      const body: { role: ShareRole; expires_in_hours?: number } = {
        role: linkRole,
      };
      if (linkExpiry !== "never") {
        body.expires_in_hours = Number(linkExpiry);
      }
      const response = await authFetch(
        `/documents/${documentId}/share-links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        auth
      );
      const payload: unknown = await response.json().catch(() => undefined);
      if (response.status === 401) {
        logout();
        return;
      }
      if (!response.ok) {
        throw new Error(
          parseErrorMessage(payload) ?? "Unable to create share link."
        );
      }
      await loadShareLinks();
    } catch (caught) {
      setLinkError(
        caught instanceof Error ? caught.message : "Unable to create share link."
      );
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleCopy = async (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      window.setTimeout(() => {
        setCopiedToken((current) => (current === token ? null : current));
      }, 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  const handleRevokeLink = async (token: string) => {
    const confirmed = window.confirm("Revoke this share link?");
    if (!confirmed) return;
    setRevokingToken(token);
    setLinkError(null);
    try {
      const response = await authFetch(
        `/documents/${documentId}/share-links/${token}`,
        { method: "DELETE" },
        auth
      );
      if (response.status === 401) {
        logout();
        return;
      }
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => undefined);
        throw new Error(
          parseErrorMessage(payload) ?? "Unable to revoke link."
        );
      }
      await loadShareLinks();
    } catch (caught) {
      setLinkError(
        caught instanceof Error ? caught.message : "Unable to revoke link."
      );
    } finally {
      setRevokingToken(null);
    }
  };

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
      const response = await authFetch(
        `/documents/${documentId}/share`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed, role }),
        },
        auth
      );

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
      const response = await authFetch(
        `/documents/${documentId}/permissions/${record.userId}`,
        { method: "DELETE" },
        auth
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

      {canManage ? (
        <div style={{ marginTop: "1rem" }}>
          <p className="field-label">Share by link</p>
          <div className="stack">
            <select
              aria-label="Share link role"
              value={linkRole}
              onChange={(e) => setLinkRole(e.target.value as ShareRole)}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <select
              aria-label="Share link expiry"
              value={linkExpiry}
              onChange={(e) => setLinkExpiry(e.target.value as ExpiryChoice)}
            >
              <option value="24">Expires in 24 hours</option>
              <option value="168">Expires in 7 days</option>
              <option value="never">Never expires</option>
            </select>
            <button
              type="button"
              onClick={() => void handleCreateLink()}
              disabled={isCreatingLink}
            >
              {isCreatingLink ? "Creating..." : "Create share link"}
            </button>
            {linkError ? <p className="error-text">{linkError}</p> : null}
          </div>

          {shareLinks.length > 0 ? (
            <ul className="version-list" style={{ marginTop: "0.75rem" }}>
              {shareLinks.map((link) => (
                <li key={link.id} className="version-item">
                  <div className="version-meta">
                    <p className="version-label">
                      {link.role}
                      {link.revoked ? " • revoked" : ""}
                    </p>
                    <p className="muted">{formatExpiry(link.expiresAt)}</p>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    {!link.revoked ? (
                      <>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => void handleCopy(link.token)}
                        >
                          {copiedToken === link.token ? "Copied!" : "Copy link"}
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => void handleRevokeLink(link.token)}
                          disabled={revokingToken === link.token}
                        >
                          {revokingToken === link.token ? "..." : "Revoke"}
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

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
