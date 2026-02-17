"""Simulation router — run Monte Carlo simulations and get AI-suggested inputs."""
import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.company import Company
from app.models.simulation import SimulationRun
from app.schemas.simulation import SimulationRequest, SimulationRunOut, SimulationSuggestion
from app.services.simulation import run_simulation
from app.agents.simulation_planner import suggest_simulation_inputs

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/companies/{company_id}/simulations",
    tags=["simulations"],
    dependencies=[Depends(get_current_user)],
)


@router.post("", response_model=SimulationRunOut)
def simulate(company_id: str, body: SimulationRequest, db: Session = Depends(get_db)):
    """Run a Monte Carlo simulation for a company."""
    company = _get_company(company_id, db)

    # Use provided values or defaults
    entry_val = body.entry_valuation or 15_000_000
    ownership = body.ownership_pct or 10.0
    check = body.check_size or (entry_val * ownership / 100.0)

    result = run_simulation(
        entry_valuation=entry_val,
        ownership_pct=ownership,
        check_size=check,
        fund_size=body.fund_size,
        exit_multiple_mean=body.exit_multiple_mean,
        exit_multiple_std=body.exit_multiple_std,
        years_to_exit=body.years_to_exit,
        scenarios=body.scenarios,
    )

    # Save to DB
    sim = SimulationRun(
        company_id=company_id,
        inputs_json=json.dumps(result["inputs"]),
        outputs_json=json.dumps({
            "monte_carlo": result["monte_carlo"],
            "scenarios": result["scenarios"],
            "impact_score": result["impact_score"],
        }),
    )
    db.add(sim)
    db.commit()
    db.refresh(sim)

    return _to_out(sim)


@router.get("", response_model=list[SimulationRunOut])
def list_simulations(company_id: str, db: Session = Depends(get_db)):
    """List past simulation runs for a company."""
    _get_company(company_id, db)
    sims = (
        db.query(SimulationRun)
        .filter(SimulationRun.company_id == company_id)
        .order_by(SimulationRun.created_at.desc())
        .all()
    )
    return [_to_out(s) for s in sims]


@router.get("/suggest", response_model=SimulationSuggestion)
def get_suggestions(company_id: str, db: Session = Depends(get_db)):
    """Use AI to suggest simulation inputs based on company context."""
    company = _get_company(company_id, db)
    suggestion = suggest_simulation_inputs(company_id, company.name)
    return suggestion


# ── Helpers ───────────────────────────────────────────────────────────────


def _get_company(company_id: str, db: Session) -> Company:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


def _to_out(sim: SimulationRun) -> dict:
    return {
        "id": sim.id,
        "company_id": sim.company_id,
        "inputs": json.loads(sim.inputs_json) if sim.inputs_json else {},
        "outputs": json.loads(sim.outputs_json) if sim.outputs_json else {},
        "created_at": sim.created_at,
    }
