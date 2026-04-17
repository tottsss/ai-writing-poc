from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from app.models.permission import Role


class DocumentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str = ""


class DocumentUpdate(BaseModel):
    content: str
    base_version: int = Field(ge=1)


class DocumentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    owner: str
    last_updated: datetime
    version: int
    role: Role

    @field_serializer("id")
    def _id_to_str(self, v: int) -> str:
        return str(v)


class DocumentListResponse(BaseModel):
    documents: list[DocumentSummary]


class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: str
    version: int
    owner: str
    role: Role
    created_at: datetime
    last_updated: datetime

    @field_serializer("id")
    def _id_to_str(self, v: int) -> str:
        return str(v)


class DocumentCreateResponse(BaseModel):
    document: DocumentSummary


class ConflictResponse(BaseModel):
    detail: str = "Document version conflict"
    latest_version: int
    latest_content: str
