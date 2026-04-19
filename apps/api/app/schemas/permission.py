from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer

from app.models.permission import Role


class ShareRequest(BaseModel):
    email: EmailStr
    role: Role


class PermissionUpdate(BaseModel):
    role: Role


class PermissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    email: EmailStr
    name: str
    role: Role
    granted_at: datetime

    @field_serializer("id", "user_id")
    def _int_to_str(self, v: int) -> str:
        return str(v)


class ShareLinkCreate(BaseModel):
    role: Role = Field(..., description="Role granted to anyone who accepts the link.")
    expires_in_hours: Optional[int] = Field(
        default=None, ge=1, le=24 * 365,
        description="Link expiry in hours from now. Omit for never-expiring link.",
    )


class ShareLinkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    token: str
    document_id: int
    role: Role
    expires_at: Optional[datetime]
    revoked: bool
    created_at: datetime

    @field_serializer("id", "document_id")
    def _int_to_str(self, v: int) -> str:
        return str(v)


class ShareLinkAcceptResponse(BaseModel):
    document_id: int
    role: Role

    @field_serializer("document_id")
    def _int_to_str(self, v: int) -> str:
        return str(v)
