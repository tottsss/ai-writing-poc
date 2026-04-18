import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type DocumentWebSocketConnectionState =
  | "closed"
  | "connecting"
  | "open"
  | "reconnecting";

export interface PresenceUser {
  userId: string;
  name?: string;
  status?: string;
}

export interface UseDocumentWebSocketResult {
  content: string | null;
  version: number | null;
  presence: PresenceUser[];
  connectionState: DocumentWebSocketConnectionState;
  isConnected: boolean;
  lastError: string | null;
  reconnect: () => void;
  sendMessage: (data: Record<string, unknown>) => void;
}

type DocumentUpdatePayload = {
  content: string;
  version: number | null;
};

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

function parseDocumentUpdate(data: unknown): DocumentUpdatePayload | null {
  const root = asObject(data);
  if (!root) {
    return null;
  }

  const payload = asObject(root.payload) ?? root;
  const nestedDocument = asObject(payload.document);
  const source = nestedDocument ?? payload;

  const content = source.content;
  if (typeof content !== "string") {
    return null;
  }

  const version = parseNumber(source.version);

  return {
    content,
    version,
  };
}

function parsePresenceUser(item: unknown): PresenceUser | null {
  if (typeof item === "string" && item.trim().length > 0) {
    return {
      userId: item,
    };
  }

  const user = asObject(item);
  if (!user) {
    return null;
  }

  const maybeUserId = user.userId ?? user.id;
  if (typeof maybeUserId !== "string" || maybeUserId.trim().length === 0) {
    return null;
  }

  const presenceUser: PresenceUser = {
    userId: maybeUserId,
  };

  if (typeof user.name === "string" && user.name.trim().length > 0) {
    presenceUser.name = user.name;
  }

  if (typeof user.status === "string" && user.status.trim().length > 0) {
    presenceUser.status = user.status;
  }

  return presenceUser;
}

function parsePresenceUpdate(data: unknown): PresenceUser[] {
  const root = asObject(data);
  if (!root) {
    return [];
  }

  const payload = asObject(root.payload) ?? root;
  const rawUsers = payload.users ?? payload.presence ?? payload.participants;

  if (!Array.isArray(rawUsers)) {
    return [];
  }

  return rawUsers
    .map((item) => parsePresenceUser(item))
    .filter((item): item is PresenceUser => item !== null);
}

function parseMessageType(data: unknown): string | null {
  const root = asObject(data);
  if (!root || typeof root.type !== "string") {
    return null;
  }

  return root.type;
}

export function useDocumentWebSocket(
  documentId: string,
  token?: string | null
): UseDocumentWebSocketResult {
  const [content, setContent] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [connectionState, setConnectionState] =
    useState<DocumentWebSocketConnectionState>("closed");
  const [lastError, setLastError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(true);

  const sendMessage = useCallback((data: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }, []);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const closeSocket = useCallback((code = 1000, reason = "cleanup") => {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }

    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;

    if (
      socket.readyState === WebSocket.CONNECTING ||
      socket.readyState === WebSocket.OPEN
    ) {
      socket.close(code, reason);
    }

    socketRef.current = null;
  }, []);

  const connect = useCallback(() => {
    if (!documentId) {
      setConnectionState("closed");
      return;
    }

    clearReconnectTimeout();
    closeSocket(1000, "reconnect");

    setConnectionState((prev) =>
      prev === "reconnecting" ? "reconnecting" : "connecting"
    );

    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
    const socket = new WebSocket(
      `ws://localhost:8000/ws/documents/${encodeURIComponent(documentId)}${tokenParam}`
    );
    socketRef.current = socket;

    socket.onopen = () => {
      reconnectAttemptRef.current = 0;
      setLastError(null);
      setConnectionState("open");
    };

    socket.onmessage = (event) => {
      let data: unknown;

      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      const messageType = parseMessageType(data);
      if (messageType === "document_updated") {
        const update = parseDocumentUpdate(data);
        if (!update) {
          return;
        }

        setContent(update.content);
        if (update.version !== null) {
          setVersion(update.version);
        }
      }

      if (messageType === "presence_update") {
        setPresence(parsePresenceUpdate(data));
      }
    };

    socket.onerror = () => {
      setLastError("WebSocket connection error.");
    };

    socket.onclose = () => {
      socketRef.current = null;
      setConnectionState("closed");

      if (!shouldReconnectRef.current || !documentId) {
        return;
      }

      const attempt = reconnectAttemptRef.current;
      const delayMs = Math.min(1000 * 2 ** attempt, 10000);
      reconnectAttemptRef.current = attempt + 1;

      setConnectionState("reconnecting");
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, delayMs);
    };
  }, [clearReconnectTimeout, closeSocket, documentId, token]);

  const reconnect = useCallback(() => {
    if (!documentId) {
      return;
    }

    reconnectAttemptRef.current = 0;
    setLastError(null);
    setConnectionState("reconnecting");
    connect();
  }, [connect, documentId]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    setContent(null);
    setVersion(null);
    setPresence([]);
    setLastError(null);

    if (documentId) {
      connect();
    } else {
      setConnectionState("closed");
    }

    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimeout();
      closeSocket();
      setConnectionState("closed");
    };
  }, [clearReconnectTimeout, closeSocket, connect, documentId, token]);

  return useMemo(
    () => ({
      content,
      version,
      presence,
      connectionState,
      isConnected: connectionState === "open",
      lastError,
      reconnect,
      sendMessage,
    }),
    [connectionState, content, lastError, presence, reconnect, sendMessage, version]
  );
}
