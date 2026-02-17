import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from app.database import Base


class SimulationRun(Base):
    __tablename__ = "simulation_runs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String, ForeignKey("companies.id"), nullable=True)
    portfolio_snapshot_id = Column(String, ForeignKey("portfolio_snapshots.id"), nullable=True)
    trigger = Column(String, nullable=True)  # "manual", "scheduled", "ai_suggest"
    inputs_json = Column(Text, nullable=True)
    outputs_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
