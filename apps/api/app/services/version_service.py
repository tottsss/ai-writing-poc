from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.document import Document
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


def list_versions(db: Session, *, document_id: int) -> list[DocumentVersion]:
    return (
        db.query(DocumentVersion)
        .filter(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version_number.desc())
        .all()
    )


def get_version(db: Session, *, document_id: int, version_id: int) -> DocumentVersion:
    version = db.get(DocumentVersion, version_id)
    if version is None or version.document_id != document_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Version not found")
    return version
