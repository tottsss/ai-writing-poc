import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.permission import Permission, Role, role_covers
from app.models.share_link import ShareLink


TOKEN_BYTES = 24


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create(
    db: Session,
    *,
    document_id: int,
    role: Role,
    expires_in_hours: int | None,
    created_by: int,
) -> ShareLink:
    if role == Role.owner:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Share links cannot grant ownership",
        )

    expires_at = (
        _now() + timedelta(hours=expires_in_hours)
        if expires_in_hours is not None
        else None
    )
    link = ShareLink(
        token=secrets.token_urlsafe(TOKEN_BYTES),
        document_id=document_id,
        role=role,
        created_by=created_by,
        expires_at=expires_at,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def list_for_document(db: Session, *, document_id: int) -> list[ShareLink]:
    return (
        db.query(ShareLink)
        .filter(ShareLink.document_id == document_id)
        .order_by(ShareLink.created_at.desc())
        .all()
    )


def revoke(db: Session, *, document_id: int, token: str) -> ShareLink:
    link = (
        db.query(ShareLink)
        .filter(ShareLink.document_id == document_id, ShareLink.token == token)
        .first()
    )
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Share link not found")
    link.revoked = True
    db.commit()
    db.refresh(link)
    return link


def accept(db: Session, *, token: str, user_id: int) -> tuple[int, Role]:
    link = db.query(ShareLink).filter(ShareLink.token == token).first()
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Share link not found")
    if link.revoked:
        raise HTTPException(status.HTTP_410_GONE, detail="Share link has been revoked")
    if link.expires_at is not None:
        expires = link.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < _now():
            raise HTTPException(status.HTTP_410_GONE, detail="Share link has expired")

    existing = (
        db.query(Permission)
        .filter(
            Permission.document_id == link.document_id,
            Permission.user_id == user_id,
        )
        .first()
    )
    if existing is None:
        db.add(
            Permission(
                document_id=link.document_id,
                user_id=user_id,
                role=link.role,
            )
        )
    elif existing.role != Role.owner and not role_covers(existing.role, link.role):
        # Upgrade only; never downgrade an existing permission or demote the owner.
        existing.role = link.role

    db.commit()
    final_role = (
        existing.role
        if existing is not None
        else link.role
    )
    return link.document_id, final_role
