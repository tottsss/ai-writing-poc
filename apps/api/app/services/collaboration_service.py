"""
In-memory WebSocket connection manager.

One room per document_id. Tracks connected sockets and the display name
of each connected user so we can broadcast presence updates.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass
class ConnectedUser:
    websocket: WebSocket
    user_id: int
    name: str


@dataclass
class Room:
    users: list[ConnectedUser] = field(default_factory=list)

    def add(self, user: ConnectedUser) -> None:
        self.users.append(user)

    def remove(self, websocket: WebSocket) -> None:
        self.users = [u for u in self.users if u.websocket is not websocket]

    def presence_payload(self) -> list[dict]:
        return [{"userId": str(u.user_id), "name": u.name} for u in self.users]


class ConnectionManager:
    """Thread-safe (asyncio-safe) manager for per-document WebSocket rooms."""

    def __init__(self) -> None:
        self._rooms: dict[int, Room] = {}

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    async def connect(
        self,
        document_id: int,
        websocket: WebSocket,
        user_id: int,
        name: str,
    ) -> None:
        await websocket.accept()
        room = self._rooms.setdefault(document_id, Room())
        room.add(ConnectedUser(websocket=websocket, user_id=user_id, name=name))
        logger.debug("User %s joined document %s (%d online)", name, document_id, len(room.users))

    def disconnect(self, document_id: int, websocket: WebSocket) -> None:
        room = self._rooms.get(document_id)
        if room is None:
            return
        room.remove(websocket)
        if not room.users:
            del self._rooms[document_id]
            logger.debug("Room %s closed (empty)", document_id)

    # ------------------------------------------------------------------
    # Broadcast helpers
    # ------------------------------------------------------------------

    async def broadcast(
        self,
        document_id: int,
        data: dict,
        exclude: WebSocket | None = None,
    ) -> None:
        """Send *data* as JSON to every connection in the room, optionally skipping one socket."""
        room = self._rooms.get(document_id)
        if room is None:
            return
        payload = json.dumps(data)
        for connected in list(room.users):
            if connected.websocket is exclude:
                continue
            try:
                await connected.websocket.send_text(payload)
            except Exception:
                logger.warning("Failed to send to user %s, skipping.", connected.user_id)

    async def send_to(self, websocket: WebSocket, data: dict) -> None:
        """Send *data* as JSON to a single socket."""
        try:
            await websocket.send_text(json.dumps(data))
        except Exception:
            logger.warning("Failed to send personal message.")

    # ------------------------------------------------------------------
    # Presence
    # ------------------------------------------------------------------

    async def broadcast_presence(self, document_id: int) -> None:
        room = self._rooms.get(document_id)
        if room is None:
            return
        await self.broadcast(
            document_id,
            {
                "type": "presence_update",
                "payload": {"users": room.presence_payload()},
            },
        )


# Singleton used by the route module
manager = ConnectionManager()
