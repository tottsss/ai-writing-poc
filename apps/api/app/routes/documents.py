from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps.auth import get_current_user
from app.deps.permissions import DocumentContext, require_role
from app.models.permission import Role
from app.models.user import User
from app.schemas.document import (
    DocumentCreate,
    DocumentCreateResponse,
    DocumentListResponse,
    DocumentRead,
    DocumentSummary,
    DocumentUpdate,
)
from app.services import document_service

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("", response_model=DocumentListResponse)
def list_documents(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DocumentListResponse:
    rows = document_service.list_documents_for_user(db, user=user)
    return DocumentListResponse(documents=[DocumentSummary(**row) for row in rows])


@router.post("", response_model=DocumentCreateResponse, status_code=status.HTTP_201_CREATED)
def create_document(
    payload: DocumentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DocumentCreateResponse:
    document = document_service.create_document(
        db, owner=user, title=payload.title, content=payload.content
    )
    summary = DocumentSummary(
        id=document.id,
        title=document.title,
        owner=user.name,
        last_updated=document.updated_at,
        version=document.version,
        role=Role.owner,
    )
    return DocumentCreateResponse(document=summary)


@router.get("/{document_id}", response_model=DocumentRead)
def get_document(
    ctx: DocumentContext = Depends(require_role(Role.viewer)),
    db: Session = Depends(get_db),
) -> DocumentRead:
    payload = document_service.serialize_document(db, document=ctx.document, role=ctx.role)
    return DocumentRead(**payload)


@router.put("/{document_id}", response_model=DocumentRead)
def update_document(
    payload: DocumentUpdate,
    ctx: DocumentContext = Depends(require_role(Role.editor)),
    db: Session = Depends(get_db),
) -> DocumentRead:
    document = document_service.update_document(
        db,
        document=ctx.document,
        user=ctx.user,
        new_content=payload.content,
        base_version=payload.version,
    )
    serialized = document_service.serialize_document(db, document=document, role=ctx.role)
    return DocumentRead(**serialized)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    ctx: DocumentContext = Depends(require_role(Role.owner)),
    db: Session = Depends(get_db),
) -> None:
    document_service.delete_document(db, document=ctx.document)

