from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_serializer

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
