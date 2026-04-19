from pydantic import BaseModel, Field


class AIParaphraseRequest(BaseModel):
    text: str = Field(..., min_length=1, description="The selected text to paraphrase.")
    content: str = Field(default="", description="Full document HTML (for context).")
    version: int = Field(..., ge=1, description="Document version the client is based on.")


class AISummarizeRequest(BaseModel):
    text: str = Field(..., min_length=1, description="The selected text to summarise.")


class AIInteractionRead(BaseModel):
    id: int
    document_id: int
    user_id: int
    feature: str
    model: str
    prompt: str
    input_text: str
    response_text: str
    accepted: bool | None

    model_config = {"from_attributes": True}
