import uuid
from datetime import datetime
from pydantic import BaseModel


class KnowledgeDocumentResponse(BaseModel):
    doc_id: uuid.UUID
    title: str
    source: str | None
    category: str | None
    indexed_at: datetime

    class Config:
        from_attributes = True
