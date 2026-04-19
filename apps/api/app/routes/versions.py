from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps.permissions import DocumentContext, require_role
from app.models.permission import Role
from app.services.collaboration_service import manager
from app.schemas.document import DocumentRead
from app.schemas.version import RestoreRequest, VersionRead
from app.services import document_service, version_service

router = APIRouter(prefix="/documents/{document_id}", tags=["versions"])


@router.get("/versions", response_model=list[VersionRead])
def list_versions(
    ctx: DocumentContext = Depends(require_role(Role.viewer)),
    db: Session = Depends(get_db),
) -> list[VersionRead]:
    rows = version_service.list_versions(db, document_id=ctx.document.id)
    return [
        VersionRead(
            id=v.id,
            version=v.version_number,
            version_type=v.version_type,
            author=author,
            timestamp=v.created_at,
        )
        for v, author in rows
    ]


@router.post("/restore", response_model=DocumentRead)
async def restore_version(
    payload: RestoreRequest,
    ctx: DocumentContext = Depends(require_role(Role.editor)),
    db: Session = Depends(get_db),
) -> DocumentRead:
    document = document_service.restore_document(
        db, document=ctx.document, version_id=payload.version_id, user=ctx.user
    )
    # Push the restored state to every other connected collaborator so
    # their editor reflects the rollback without needing a page refresh.
    await manager.broadcast(
        ctx.document.id,
        {
            "type": "document_updated",
            "payload": {
                "content": document.current_content,
                "version": document.version,
            },
        },
    )
    serialized = document_service.serialize_document(db, document=document, role=ctx.role)
    return DocumentRead(**serialized)
