import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, LargeBinary, String, Text, DateTime, ForeignKey
from app.database import Base


class DealflowDocument(Base):
    __tablename__ = "dealflow_documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    dealflow_entry_id = Column(
        String, ForeignKey("dealflow_entries.id", ondelete="CASCADE"), nullable=False
    )
    type = Column(String, nullable=False)  # pitch_deck | other
    url = Column(String, nullable=True)
    original_filename = Column(String, nullable=True)
    file_content = Column(LargeBinary, nullable=True)
    extracted_text = Column(Text, nullable=True)
    status = Column(String, default="processing")  # processing | ready | error
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
