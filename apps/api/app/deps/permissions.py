from collections.abc import Callable

from fastapi import Depends, HTTPException, Path, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps.auth import get_current_user
from app.models.document import Document
from app.models.permission import Permission, Role, role_covers
from app.models.user import User


class DocumentContext:
    """Injected into routes that need the loaded document + caller's role."""

    def __init__(self, document: Document, role: Role, user: User):
        self.document = document
        self.role = role
        self.user = user


def require_role(minimum: Role) -> Callable[..., DocumentContext]:
    def _dep(
        document_id: int = Path(..., ge=1),
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> DocumentContext:
        document = db.get(Document, document_id)
        if document is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Document not found")

        permission = (
            db.query(Permission)
            .filter(Permission.document_id == document_id, Permission.user_id == user.id)
            .first()
        )
        if permission is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="No access to this document")

        if not role_covers(permission.role, minimum):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail=f"Requires {minimum.value} role or higher",
            )

        return DocumentContext(document=document, role=permission.role, user=user)

    return _dep


