from fastapi import APIRouter, Depends, Path, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps.permissions import DocumentContext, require_role
from app.models.permission import Role
from app.schemas.permission import PermissionRead, PermissionUpdate, ShareRequest
from app.services import permission_service

router = APIRouter(prefix="/documents/{document_id}", tags=["permissions"])


def _to_permission_read(perm, user) -> PermissionRead:
    return PermissionRead(
        id=perm.id,
        user_id=user.id,
        email=user.email,
        name=user.name,
        role=perm.role,
        granted_at=perm.granted_at,
    )


@router.post("/share", response_model=PermissionRead, status_code=status.HTTP_201_CREATED)
def share_document(
    payload: ShareRequest,
    ctx: DocumentContext = Depends(require_role(Role.owner)),
    db: Session = Depends(get_db),
) -> PermissionRead:
    perm = permission_service.share_document(
        db, document_id=ctx.document.id, email=payload.email, role=payload.role
    )
    rows = permission_service.list_permissions(db, document_id=ctx.document.id)
    target = next((u for p, u in rows if p.id == perm.id), None)
    return _to_permission_read(perm, target)


@router.get("/permissions", response_model=list[PermissionRead])
def list_permissions(
    ctx: DocumentContext = Depends(require_role(Role.viewer)),
    db: Session = Depends(get_db),
) -> list[PermissionRead]:
    rows = permission_service.list_permissions(db, document_id=ctx.document.id)
    return [_to_permission_read(perm, user) for perm, user in rows]


@router.put("/permissions/{user_id}", response_model=PermissionRead)
def update_permission(
    payload: PermissionUpdate,
    user_id: int = Path(..., ge=1),
    ctx: DocumentContext = Depends(require_role(Role.owner)),
    db: Session = Depends(get_db),
) -> PermissionRead:
    perm = permission_service.update_permission(
        db, document_id=ctx.document.id, user_id=user_id, role=payload.role
    )
    rows = permission_service.list_permissions(db, document_id=ctx.document.id)
    target = next((u for p, u in rows if p.id == perm.id), None)
    return _to_permission_read(perm, target)


@router.delete("/permissions/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_permission(
    user_id: int = Path(..., ge=1),
    ctx: DocumentContext = Depends(require_role(Role.owner)),
    db: Session = Depends(get_db),
) -> None:
    permission_service.revoke_permission(
        db, document_id=ctx.document.id, user_id=user_id
    )
