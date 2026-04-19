"""
AI writing assistant endpoints.

Both features stream their response token-by-token using FastAPI's
StreamingResponse so the frontend can render text progressively as
chunks arrive.  The streaming UX also allows the user to cancel
mid-generation (the browser simply aborts the fetch).

Endpoints
---------
POST /documents/{document_id}/ai/paraphrase
    Rewrite / rephrase selected text.  Requires editor role.

POST /documents/{document_id}/ai/summarize
    Summarise selected text.  Requires editor role.

GET  /documents/{document_id}/ai/history
    Return all AI interactions logged for this document.  Requires viewer role.

PATCH /documents/{document_id}/ai/history/{interaction_id}
    Record whether the user accepted or rejected a suggestion.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps.permissions import DocumentContext, require_role
from app.models.ai_interaction import AIInteraction
from app.models.permission import Role
from app.schemas.ai import AIInteractionRead, AIParaphraseRequest, AISummarizeRequest
from app.services.ai_service import PROMPTS, get_provider

router = APIRouter(prefix="/documents", tags=["ai"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Shared streaming helper
# ---------------------------------------------------------------------------


async def _stream_and_log(
    *,
    feature: str,
    text: str,
    document_id: int,
    user_id: int,
    db: Session,
) -> AsyncIterator[bytes]:
    """
    Stream AI output chunk-by-chunk and persist the full response to the
    ai_interactions table once generation is complete.
    """
    provider = get_provider()
    collected: list[str] = []

    async for chunk in provider.stream(feature=feature, text=text):
        collected.append(chunk)
        yield chunk.encode()

    full_response = "".join(collected)
    interaction = AIInteraction(
        document_id=document_id,
        user_id=user_id,
        feature=feature,
        input_text=text,
        response_text=full_response,
    )
    db.add(interaction)
    db.commit()
    logger.info("AI interaction logged: doc=%s feature=%s user=%s", document_id, feature, user_id)


# ---------------------------------------------------------------------------
# Paraphrase
# ---------------------------------------------------------------------------


@router.post(
    "/{document_id}/ai/paraphrase",
    summary="Paraphrase selected text (streaming)",
    description=(
        "Rewrites the supplied text with improved clarity and academic tone. "
        "Response is streamed token-by-token so the client renders it progressively. "
        "Requires **editor** or **owner** role."
    ),
)
async def paraphrase(
    payload: AIParaphraseRequest,
    ctx: DocumentContext = Depends(require_role(Role.editor)),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    logger.info("Paraphrase requested: doc=%s user=%s", ctx.document.id, ctx.user.id)
    return StreamingResponse(
        _stream_and_log(
            feature="paraphrase",
            text=payload.text,
            document_id=ctx.document.id,
            user_id=ctx.user.id,
            db=db,
        ),
        media_type="text/plain",
    )


# ---------------------------------------------------------------------------
# Summarize
# ---------------------------------------------------------------------------


@router.post(
    "/{document_id}/ai/summarize",
    summary="Summarise selected text (streaming)",
    description=(
        "Produces a concise 2-3 sentence academic summary of the supplied text. "
        "Response is streamed token-by-token. "
        "Requires **editor** or **owner** role."
    ),
)
async def summarize(
    payload: AISummarizeRequest,
    ctx: DocumentContext = Depends(require_role(Role.editor)),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    logger.info("Summarize requested: doc=%s user=%s", ctx.document.id, ctx.user.id)
    return StreamingResponse(
        _stream_and_log(
            feature="summarize",
            text=payload.text,
            document_id=ctx.document.id,
            user_id=ctx.user.id,
            db=db,
        ),
        media_type="text/plain",
    )


# ---------------------------------------------------------------------------
# AI interaction history
# ---------------------------------------------------------------------------


@router.get(
    "/{document_id}/ai/history",
    response_model=list[AIInteractionRead],
    summary="AI interaction history for a document",
    description="Returns all AI calls made within this document, newest first. Requires **viewer** role.",
)
def get_ai_history(
    ctx: DocumentContext = Depends(require_role(Role.viewer)),
    db: Session = Depends(get_db),
) -> list[AIInteraction]:
    return (
        db.query(AIInteraction)
        .filter(AIInteraction.document_id == ctx.document.id)
        .order_by(AIInteraction.created_at.desc())
        .all()
    )


# ---------------------------------------------------------------------------
# Accept / reject outcome
# ---------------------------------------------------------------------------


@router.patch(
    "/{document_id}/ai/history/{interaction_id}",
    response_model=AIInteractionRead,
    summary="Record accept/reject outcome for an AI suggestion",
    description="Sets the accepted field on an interaction record. Requires **editor** role.",
)
def record_outcome(
    interaction_id: int,
    accepted: bool,
    ctx: DocumentContext = Depends(require_role(Role.editor)),
    db: Session = Depends(get_db),
) -> AIInteraction:
    interaction = db.get(AIInteraction, interaction_id)
    if interaction is None or interaction.document_id != ctx.document.id:
        from fastapi import HTTPException, status
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Interaction not found")
    interaction.accepted = accepted
    db.commit()
    db.refresh(interaction)
    return interaction
