import { useMemo } from "react";
import {
  type DocumentWebSocketConnectionState,
  useDocumentWebSocket,
  type PresenceUser,
} from "../hooks/useDocumentWebSocket";

export interface PresenceIndicatorProps {
  documentId?: string;
  users?: PresenceUser[];
  connectionState?: DocumentWebSocketConnectionState;
  lastError?: string | null;
  onReconnect?: () => void;
}

const BADGE_COLORS = [
  "#155EEF",
  "#DD2590",
  "#9E77ED",
  "#039855",
  "#B54708",
  "#0E9384",
  "#0063F7",
  "#DC6803",
  "#7A5AF8",
  "#C01048",
];

function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function getUserDisplayName(user: PresenceUser): string {
  if (user.name && user.name.trim().length > 0) {
    return user.name;
  }

  return user.userId;
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getBadgeColor(userId: string): string {
  const index = hashString(userId) % BADGE_COLORS.length;
  return BADGE_COLORS[index];
}

function PresenceIndicator({
  documentId,
  users,
  connectionState,
  lastError,
  onReconnect,
}: PresenceIndicatorProps) {
  const socketState = useDocumentWebSocket(documentId ?? "");

  const resolvedUsers = users ?? socketState.presence;
  const resolvedConnectionState = connectionState ?? socketState.connectionState;
  const resolvedError = lastError ?? socketState.lastError;
  const handleReconnect = onReconnect ?? socketState.reconnect;

  const activeUsers = useMemo(
    () =>
      resolvedUsers.slice().sort((leftUser, rightUser) => {
        const leftName = getUserDisplayName(leftUser).toLowerCase();
        const rightName = getUserDisplayName(rightUser).toLowerCase();
        return leftName.localeCompare(rightName);
      }),
    [resolvedUsers]
  );

  return (
    <section className="presence-indicator card">
      <div className="presence-header">
        <h3>Active Users ({activeUsers.length})</h3>
        <span className="presence-connection-state">
          Socket: {resolvedConnectionState}
        </span>
      </div>

      {resolvedError ? (
        <div className="presence-error-row">
          <p className="error-text">{resolvedError}</p>
          <button type="button" onClick={handleReconnect}>
            Reconnect
          </button>
        </div>
      ) : null}

      {activeUsers.length === 0 ? (
        <p className="muted">No active collaborators.</p>
      ) : (
        <ul className="presence-user-list">
          {activeUsers.map((user) => {
            const displayName = getUserDisplayName(user);
            const badgeColor = getBadgeColor(user.userId);

            return (
              <li key={user.userId} className="presence-user-item">
                <span
                  className="presence-user-badge"
                  style={{ backgroundColor: badgeColor }}
                  aria-hidden="true"
                >
                  {getInitials(displayName)}
                </span>
                <span className="presence-user-name">{displayName}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default PresenceIndicator;
