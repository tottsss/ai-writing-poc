from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps.permissions import DocumentContext, require_role
from app.models.permission import Role
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
    return [VersionRead.model_validate(row) for row in rows]


@router.post("/restore", response_model=DocumentRead)
def restore_version(
    payload: RestoreRequest,
    ctx: DocumentContext = Depends(require_role(Role.owner)),
    db: Session = Depends(get_db),
) -> DocumentRead:
    document = document_service.restore_document(
        db, document=ctx.document, version_id=payload.version_id, user=ctx.user
    )
    serialized = document_service.serialize_document(db, document=document, role=ctx.role)
    return DocumentRead(**serialized)
