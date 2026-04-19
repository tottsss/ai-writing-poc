from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.permission import Permission, Role
from app.models.user import User


def create_owner_permission(db: Session, *, document_id: int, user_id: int) -> Permission:
    perm = Permission(document_id=document_id, user_id=user_id, role=Role.owner)
    db.add(perm)
    db.flush()
    return perm


def share_document(
    db: Session, *, document_id: int, email: str, role: Role
) -> Permission:
    if role == Role.owner:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Ownership transfer is not supported",
        )

    target = db.query(User).filter(User.email == email.lower()).first()
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = (
        db.query(Permission)
        .filter(Permission.document_id == document_id, Permission.user_id == target.id)
        .first()
    )
    if existing is not None:
        if existing.role == Role.owner:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail="Cannot reassign the owner"
            )
        existing.role = role
        db.commit()
        db.refresh(existing)
        return existing

    perm = Permission(document_id=document_id, user_id=target.id, role=role)
    db.add(perm)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Permission already exists"
        ) from exc
    db.refresh(perm)
    return perm


def list_permissions(db: Session, *, document_id: int) -> list[tuple[Permission, User]]:
    rows = (
        db.query(Permission, User)
        .join(User, User.id == Permission.user_id)
        .filter(Permission.document_id == document_id)
        .order_by(Permission.granted_at.asc())
        .all()
    )
    return rows


def update_permission(
    db: Session, *, document_id: int, user_id: int, role: Role
) -> Permission:
    if role == Role.owner:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Ownership transfer is not supported",
        )
    perm = (
        db.query(Permission)
        .filter(Permission.document_id == document_id, Permission.user_id == user_id)
        .first()
    )
    if perm is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Permission not found")
    if perm.role == Role.owner:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Cannot change the owner's role"
        )
    perm.role = role
    db.commit()
    db.refresh(perm)
    return perm


def revoke_permission(db: Session, *, document_id: int, user_id: int) -> None:
    perm = (
        db.query(Permission)
        .filter(Permission.document_id == document_id, Permission.user_id == user_id)
        .first()
    )
    if perm is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Permission not found")
    if perm.role == Role.owner:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Cannot revoke the owner's permission"
        )
    db.delete(perm)
    db.commit()


def get_role(db: Session, *, document_id: int, user_id: int) -> Role | None:
    perm = (
        db.query(Permission)
        .filter(Permission.document_id == document_id, Permission.user_id == user_id)
        .first()
    )
    return perm.role if perm else None
