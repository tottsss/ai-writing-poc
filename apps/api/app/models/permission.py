import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Role(str, enum.Enum):
    owner = "owner"
    editor = "editor"
    viewer = "viewer"


# Ordering used for "at least this role" checks.
_ROLE_RANK = {Role.viewer: 1, Role.editor: 2, Role.owner: 3}


def role_covers(actual: Role, minimum: Role) -> bool:
    return _ROLE_RANK[actual] >= _ROLE_RANK[minimum]


class Permission(Base):
    __tablename__ = "permissions"
    __table_args__ = (
        UniqueConstraint("document_id", "user_id", name="uq_doc_user_permission"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[Role] = mapped_column(Enum(Role, name="permission_role"), nullable=False)
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
