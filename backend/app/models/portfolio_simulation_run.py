import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime
from app.database import Base


class PortfolioSimulationRun(Base):
    __tablename__ = "portfolio_simulation_runs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    inputs_json = Column(Text, nullable=True)
    outputs_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    trigger = Column(String, nullable=True)  # "manual", "scheduled"
