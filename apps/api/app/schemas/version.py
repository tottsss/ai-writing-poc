from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from app.models.version import VersionType


class VersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    version: int
    version_type: VersionType
    author: str
    timestamp: datetime

    @field_serializer("id")
    def _id_to_str(self, v: int) -> str:
        return str(v)


class RestoreRequest(BaseModel):
    version_id: int = Field(ge=1)
