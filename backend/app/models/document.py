import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, LargeBinary, String, Text, DateTime, ForeignKey
from app.database import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    type = Column(String, nullable=False)  # deck | call_notes | website | other
    storage_path = Column(String, nullable=True)
    url = Column(String, nullable=True)
    original_filename = Column(String, nullable=True)  # for file uploads: name to use on download
    file_content = Column(LargeBinary, nullable=True)  # persisted file bytes (PDF etc.) for download
    extracted_text = Column(Text, nullable=True)
    status = Column(String, default="processing")  # processing | ready | error
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
