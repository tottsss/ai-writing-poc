from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_serializer


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str
    created_at: datetime

    @field_serializer("id")
    def _id_to_str(self, v: int) -> str:
        return str(v)
