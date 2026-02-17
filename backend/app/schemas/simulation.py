from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class SimulationRequest(BaseModel):
    entry_valuation: Optional[float] = None
    ownership_pct: Optional[float] = None
    check_size: Optional[float] = None
    fund_size: float = 5_000_000
    exit_multiple_mean: float = 8.0
    exit_multiple_std: float = 6.0
    years_to_exit: int = 7
    scenarios: Optional[list[dict]] = None


class SimulationRunOut(BaseModel):
    id: str
    company_id: Optional[str] = None
    inputs: dict
    outputs: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class SimulationSuggestion(BaseModel):
    entry_valuation: float
    ownership_pct: float
    check_size: float
    fund_size: float
    exit_multiple_mean: float
    exit_multiple_std: float
    years_to_exit: int
    scenarios: list[dict]
    rationale: str
