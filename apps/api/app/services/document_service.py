from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.document import Document
from app.models.permission import Permission, Role
from app.models.user import User
from app.models.version import VersionType
from app.services import permission_service, version_service


class StaleVersionError(HTTPException):
    """Raised when the client's base_version doesn't match the server's current version."""

    def __init__(self, latest_version: int, latest_content: str):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "detail": "Document version conflict",
                "latest_version": latest_version,
                "latest_content": latest_content,
            },
        )


def create_document(
    db: Session, *, owner: User, title: str, content: str
) -> Document:
    document = Document(
        title=title,
        current_content=content,
        version=1,
        owner_id=owner.id,
    )
    db.add(document)
    db.flush()  # gets document.id

    permission_service.create_owner_permission(
        db, document_id=document.id, user_id=owner.id
    )
    version_service.create_version(
        db,
        document=document,
        content=content,
        created_by=owner.id,
        version_type=VersionType.manual_save,
    )

    db.commit()
    db.refresh(document)
    return document


def update_document(
    db: Session,
    *,
    document: Document,
    user: User,
    new_content: str,
    base_version: int,
) -> Document:
    if base_version != document.version:
        raise StaleVersionError(
            latest_version=document.version,
            latest_content=document.current_content,
        )

    document.version += 1
    document.current_content = new_content
    version_service.create_version(
        db,
        document=document,
        content=new_content,
        created_by=user.id,
        version_type=VersionType.manual_save,
    )
    db.commit()
    db.refresh(document)
    return document


def delete_document(db: Session, *, document: Document) -> None:
    db.delete(document)
    db.commit()


def restore_document(
    db: Session, *, document: Document, version_id: int, user: User
) -> Document:
    snapshot = version_service.get_version(
        db, document_id=document.id, version_id=version_id
    )
    document.version += 1
    document.current_content = snapshot.content_snapshot
    version_service.create_version(
        db,
        document=document,
        content=snapshot.content_snapshot,
        created_by=user.id,
        version_type=VersionType.restore,
    )
    db.commit()
    db.refresh(document)
    return document


def list_documents_for_user(db: Session, *, user: User) -> list[dict]:
    """
    Returns one row per document the user has access to, joined with the owner's
    name and the caller's role. Shaped for `DocumentSummary`.
    """
    rows = (
        db.query(Document, Permission.role, User.name)
        .join(Permission, Permission.document_id == Document.id)
        .join(User, User.id == Document.owner_id)
        .filter(Permission.user_id == user.id)
        .order_by(Document.updated_at.desc())
        .all()
    )
    return [
        {
            "id": doc.id,
            "title": doc.title,
            "owner": owner_name,
            "last_updated": doc.updated_at,
            "version": doc.version,
            "role": role,
        }
        for doc, role, owner_name in rows
    ]


def serialize_document(
    db: Session, *, document: Document, role: Role
) -> dict:
    owner = db.get(User, document.owner_id)
    owner_name = owner.name if owner else ""
    return {
        "id": document.id,
        "title": document.title,
        "content": document.current_content,
        "version": document.version,
        "owner": owner_name,
        "role": role,
        "created_at": document.created_at,
        "last_updated": document.updated_at,
    }
