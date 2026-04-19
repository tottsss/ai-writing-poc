"""
WebSocket endpoint for real-time document collaboration.

Protocol
--------
Client → Server
  {"type": "document_update", "content": "<html>", "version": N}
  {"type": "typing", "is_typing": true|false}

Server → Client  (on connect, or after every accepted update)
  {"type": "document_updated", "payload": {"content": "<html>", "version": N}}

Server → All clients in the room
  {"type": "presence_update", "payload": {"users": [{"userId": "...", "name": "..."}]}}
  {"type": "typing_update",   "payload": {"user_id": "...", "name": "...", "is_typing": bool}}

Conflict resolution (Optimistic Concurrency Control)
----------------------------------------------------
Each update carries the version the client believes the document is on.
If that matches the server's current version the update is accepted,
the version is incremented, and the new state is broadcast to everyone.
If it doesn't match the server sends the requesting client the current
server state so it can silently resync — no data is lost.
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, WebSocketException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps.auth import get_current_user_ws
from app.models.permission import Role
from app.services import document_service
from app.services.collaboration_service import manager

router = APIRouter(tags=["collaboration"])
logger = logging.getLogger(__name__)


@router.websocket("/ws/documents/{document_id}")
async def document_ws(
    document_id: int,
    websocket: WebSocket,
    db: Session = Depends(get_db),
) -> None:
    """
    Authenticated WebSocket session for a single document.

    Auth: JWT passed as ?token= query param (browsers cannot set Authorization
    headers on WS upgrades, so this is the standard approach).

    The caller must have at least viewer-level access to join.
    Editors and owners may send content updates.
    """
    # ----- Authenticate -----
    try:
        user = await get_current_user_ws(websocket, db)
    except WebSocketException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # ----- Authorise: must have access to this document -----
    from app.models.document import Document
    from app.models.permission import Permission

    document = db.get(Document, document_id)
    if document is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Document not found")
        return

    permission = (
        db.query(Permission)
        .filter(Permission.document_id == document_id, Permission.user_id == user.id)
        .first()
    )
    if permission is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="No access")
        return

    can_edit = permission.role in (Role.editor, Role.owner)

    # ----- Join room -----
    await manager.connect(document_id, websocket, user_id=user.id, name=user.name)

    # Send the current document state to the newly connected client
    await manager.send_to(
        websocket,
        {
            "type": "document_updated",
            "payload": {
                "content": document.current_content,
                "version": document.version,
            },
        },
    )

    # Notify everyone (including the newcomer) of the updated presence list
    await manager.broadcast_presence(document_id)

    # ----- Message loop -----
    try:
        while True:
            raw = await websocket.receive_text()

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue  # ignore malformed frames

            msg_type = msg.get("type") if isinstance(msg, dict) else None

            if msg_type == "document_update":
                if not can_edit:
                    # Viewers cannot write — silently ignore
                    continue

                incoming_content = msg.get("content", "")
                incoming_version = msg.get("version")

                if not isinstance(incoming_version, int):
                    continue

                # Re-fetch to get the freshest version (another connection may have updated)
                db.refresh(document)

                if incoming_version != document.version:
                    # --- Conflict: resync this client with the server state ---
                    await manager.send_to(
                        websocket,
                        {
                            "type": "document_updated",
                            "payload": {
                                "content": document.current_content,
                                "version": document.version,
                            },
                        },
                    )
                    logger.info(
                        "OCC conflict for doc %s: client version %s, server version %s",
                        document_id,
                        incoming_version,
                        document.version,
                    )
                    continue

                # --- Accept: persist and broadcast ---
                # WS updates are live sync; they don't create restorable
                # versions or bump the version counter. Milestone snapshots
                # come from REST autosave, AI accept, and restore.
                try:
                    document = document_service.update_document(
                        db,
                        document=document,
                        user=user,
                        new_content=incoming_content,
                        base_version=incoming_version,
                        create_version_entry=False,
                        bump_version=False,
                    )
                except document_service.StaleVersionError:
                    # Race between two concurrent acceptances — resync
                    db.refresh(document)
                    await manager.send_to(
                        websocket,
                        {
                            "type": "document_updated",
                            "payload": {
                                "content": document.current_content,
                                "version": document.version,
                            },
                        },
                    )
                    continue

                await manager.broadcast(
                    document_id,
                    {
                        "type": "document_updated",
                        "payload": {
                            "content": document.current_content,
                            "version": document.version,
                        },
                    },
                )

            elif msg_type == "typing":
                # Ephemeral activity signal — no DB write. Tell the other
                # participants this user's typing state.
                is_typing = bool(msg.get("is_typing", False))
                await manager.broadcast(
                    document_id,
                    {
                        "type": "typing_update",
                        "payload": {
                            "user_id": str(user.id),
                            "name": user.name,
                            "is_typing": is_typing,
                        },
                    },
                    exclude=websocket,
                )

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(document_id, websocket)
        await manager.broadcast_presence(document_id)
        logger.info("User %s left document %s", user.name, document_id)
