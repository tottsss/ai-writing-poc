from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.document import Document
from app.models.user import User
from app.models.version import DocumentVersion, VersionType


def create_version(
    db: Session,
    *,
    document: Document,
    content: str,
    created_by: int | None,
    version_type: VersionType,
    flush: bool = True,
) -> DocumentVersion:
    """
    Append a new snapshot to the document's history. Caller is responsible for
    bumping `document.version` and updating `document.current_content` (this keeps
    the snapshot insert atomic with whatever transaction the caller is running).
    """
    snapshot = DocumentVersion(
        document_id=document.id,
        version_number=document.version,
        content_snapshot=content,
        created_by=created_by,
        version_type=version_type,
    )
    db.add(snapshot)
    if flush:
        db.flush()
    return snapshot


def list_versions(db: Session, *, document_id: int) -> list[tuple[DocumentVersion, str]]:
    """Returns (version, author_name) pairs. Author defaults to "Unknown" if the
    user has been deleted (created_by is nullable via SET NULL)."""
    rows = (
        db.query(DocumentVersion, User.name)
        .outerjoin(User, User.id == DocumentVersion.created_by)
        .filter(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version_number.desc())
        .all()
    )
    return [(v, name or "Unknown") for v, name in rows]


def get_version(db: Session, *, document_id: int, version_id: int) -> DocumentVersion:
    version = db.get(DocumentVersion, version_id)
    if version is None or version.document_id != document_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Version not found")
    return version
