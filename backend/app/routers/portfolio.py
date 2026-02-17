"""Portfolio CRUD router."""
import json
import logging
import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.portfolio import PortfolioSnapshot
from app.models.portfolio_update import PortfolioUpdate
from app.models.portfolio_simulation_run import PortfolioSimulationRun
from app.models.company import Company
from app.models.simulation import SimulationRun
from app.schemas.portfolio import (
    PortfolioSnapshotOut,
    PortfolioCreateRequest,
    PortfolioUpdateRequest,
    PortfolioUpdateCreate,
    PortfolioUpdateOut,
)

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/portfolio",
    tags=["portfolio"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=list[PortfolioSnapshotOut])
def list_portfolio(db: Session = Depends(get_db)):
    """List all portfolio entries."""
    rows = db.query(PortfolioSnapshot).order_by(PortfolioSnapshot.company_name).all()
    return rows


@router.post("", response_model=PortfolioSnapshotOut)
def create_portfolio_entry(body: PortfolioCreateRequest, db: Session = Depends(get_db)):
    """Manually add a company to the portfolio."""
    snap = PortfolioSnapshot(
        company_name=body.company_name,
        one_liner=body.one_liner,
        website=body.website,
        investment_stage=body.investment_stage,
        investment_size=body.investment_size,
        entry_valuation=body.entry_valuation,
        last_valuation=body.last_valuation,
        ownership_pct=body.ownership_pct,
        investment_date=_parse_date(body.investment_date),
        sector=body.sector,
        geography=body.geography,
        founder_type=body.founder_type,
        outlier_probability=body.outlier_probability,
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return snap


@router.patch("/{entry_id}", response_model=PortfolioSnapshotOut)
def update_portfolio_entry(
    entry_id: str,
    body: PortfolioUpdateRequest,
    db: Session = Depends(get_db),
):
    """Update an existing portfolio entry."""
    snap = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.id == entry_id).first()
    if not snap:
        raise HTTPException(status_code=404, detail="Portfolio entry not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "investment_date":
            setattr(snap, field, _parse_date(value))
        else:
            setattr(snap, field, value)

    db.commit()
    db.refresh(snap)
    return snap


@router.delete("/{entry_id}")
def delete_portfolio_entry(entry_id: str, db: Session = Depends(get_db)):
    """Delete a single portfolio entry."""
    snap = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.id == entry_id).first()
    if not snap:
        raise HTTPException(status_code=404, detail="Portfolio entry not found")
    db.delete(snap)
    db.commit()
    return {"ok": True}


@router.delete("")
def clear_portfolio(db: Session = Depends(get_db)):
    """Clear all portfolio data."""
    db.query(PortfolioSnapshot).delete()
    db.commit()
    return {"ok": True}


# ── Portfolio Updates (notes / audit trail) ──────────────────────────────


@router.get("/{entry_id}", response_model=PortfolioSnapshotOut)
def get_portfolio_entry(entry_id: str, db: Session = Depends(get_db)):
    """Get a single portfolio entry."""
    snap = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.id == entry_id).first()
    if not snap:
        raise HTTPException(status_code=404, detail="Portfolio entry not found")
    return snap


@router.post("/{entry_id}/updates", response_model=PortfolioUpdateOut)
def create_update(
    entry_id: str,
    body: PortfolioUpdateCreate,
    db: Session = Depends(get_db),
):
    """Add an unstructured update/note for a portfolio company. Also indexes into RAG."""
    snap = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.id == entry_id).first()
    if not snap:
        raise HTTPException(status_code=404, detail="Portfolio entry not found")

    update = PortfolioUpdate(
        portfolio_snapshot_id=entry_id,
        content=body.content,
        source=body.source,
    )
    db.add(update)
    db.commit()
    db.refresh(update)

    # Index into RAG so agents can use the context
    _index_update_into_rag(snap, update)

    return update


@router.get("/{entry_id}/updates", response_model=list[PortfolioUpdateOut])
def list_updates(entry_id: str, db: Session = Depends(get_db)):
    """List all updates for a portfolio company (audit trail)."""
    snap = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.id == entry_id).first()
    if not snap:
        raise HTTPException(status_code=404, detail="Portfolio entry not found")
    updates = (
        db.query(PortfolioUpdate)
        .filter(PortfolioUpdate.portfolio_snapshot_id == entry_id)
        .order_by(PortfolioUpdate.created_at.desc())
        .all()
    )
    return updates


@router.post("/{entry_id}/simulate", response_model=dict)
def run_portfolio_simulation(entry_id: str, db: Session = Depends(get_db)):
    """Run a simulation for a portfolio company using its data and RAG context."""
    snap = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.id == entry_id).first()
    if not snap:
        raise HTTPException(status_code=404, detail="Portfolio entry not found")
    if not snap.entry_valuation or not snap.investment_size:
        raise HTTPException(
            status_code=400,
            detail="Entry valuation and investment size are required to run a simulation",
        )

    from app.services.simulation import run_simulation
    from app.agents.simulation_planner import suggest_simulation_inputs

    # Use AI to suggest exit assumptions from RAG context
    rag_key = snap.company_id if snap.company_id else f"portfolio_{snap.id}"
    try:
        suggestion = suggest_simulation_inputs(rag_key, snap.company_name)
        exit_mult_mean = suggestion.get("exit_multiple_mean", 8.0)
        exit_mult_std = suggestion.get("exit_multiple_std", 6.0)
        years_to_exit = suggestion.get("years_to_exit", 7)
        scenarios = suggestion.get("scenarios")
    except Exception as e:
        logger.warning(f"AI suggest failed for portfolio sim, using defaults: {e}")
        exit_mult_mean = 8.0
        exit_mult_std = 6.0
        years_to_exit = 7
        scenarios = None

    ownership = snap.ownership_pct or (
        (snap.investment_size / snap.entry_valuation * 100)
        if snap.entry_valuation > 0
        else 0
    )

    result = run_simulation(
        entry_valuation=snap.entry_valuation,
        ownership_pct=ownership,
        check_size=snap.investment_size,
        fund_size=5_000_000,
        exit_multiple_mean=exit_mult_mean,
        exit_multiple_std=exit_mult_std,
        years_to_exit=years_to_exit,
        scenarios=scenarios,
    )

    # Save to DB
    sim = SimulationRun(
        company_id=snap.company_id,
        portfolio_snapshot_id=entry_id,
        trigger="manual",
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

    return {
        "id": sim.id,
        "company_id": sim.company_id,
        "portfolio_snapshot_id": sim.portfolio_snapshot_id,
        "inputs": json.loads(sim.inputs_json),
        "outputs": json.loads(sim.outputs_json),
        "created_at": sim.created_at.isoformat(),
    }


# ── Portfolio-level latent-factor simulation ───────────────────────────────


@router.post("/simulate-portfolio", response_model=dict)
def run_portfolio_level_simulation(db: Session = Depends(get_db)):
    """Run portfolio-level correlated outlier simulation across all portfolio companies.
    Uses diligence docs and portfolio notes (RAG) to suggest outlier probability when
    no manual override is set; otherwise uses sector/geography/founder formula.
    """
    from app.services.portfolio_simulation import run_portfolio_simulation
    from app.services.outlier_probability import compute_standalone_probability
    from app.agents.simulation_planner import suggest_outlier_probability

    rows = db.query(PortfolioSnapshot).order_by(PortfolioSnapshot.company_name).all()
    companies = []
    for r in rows:
        effective_p = r.outlier_probability
        rag_rationale = None
        if effective_p is None:
            rag_key = r.company_id if r.company_id else f"portfolio_{r.id}"
            try:
                suggestion = suggest_outlier_probability(rag_key, r.company_name)
                if suggestion:
                    effective_p = suggestion["outlier_probability"]
                    rag_rationale = suggestion.get("rationale") or ""
            except Exception as e:
                logger.warning(f"RAG outlier suggestion failed for {r.company_name}: {e}")
            if effective_p is None:
                effective_p = compute_standalone_probability(r.sector, r.geography, r.founder_type)
        companies.append({
            "id": r.id,
            "company_name": r.company_name,
            "sector": r.sector,
            "geography": r.geography,
            "founder_type": r.founder_type,
            "outlier_probability": effective_p,
            "rag_rationale": rag_rationale,
        })
    result = run_portfolio_simulation(companies, num_simulations=100_000)
    run = PortfolioSimulationRun(
        trigger="manual",
        inputs_json=json.dumps({"num_companies": len(companies), "company_ids": [c["id"] for c in companies]}),
        outputs_json=json.dumps(result),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return {
        "id": run.id,
        "created_at": run.created_at.isoformat(),
        "trigger": run.trigger,
        "inputs": json.loads(run.inputs_json or "{}"),
        "outputs": result,
    }


@router.get("/simulation/latest", response_model=dict)
def get_latest_portfolio_simulation(db: Session = Depends(get_db)):
    """Return the most recent portfolio-level simulation run."""
    run = (
        db.query(PortfolioSimulationRun)
        .order_by(PortfolioSimulationRun.created_at.desc())
        .first()
    )
    if not run:
        return {"run": None, "outputs": None}
    return {
        "run": {
            "id": run.id,
            "created_at": run.created_at.isoformat(),
            "trigger": run.trigger,
        },
        "outputs": json.loads(run.outputs_json) if run.outputs_json else None,
    }


@router.get("/{entry_id}/simulations", response_model=list[dict])
def list_portfolio_simulations(entry_id: str, db: Session = Depends(get_db)):
    """List simulation runs for a portfolio entry."""
    sims = (
        db.query(SimulationRun)
        .filter(SimulationRun.portfolio_snapshot_id == entry_id)
        .order_by(SimulationRun.created_at.desc())
        .all()
    )
    return [
        {
            "id": s.id,
            "company_id": s.company_id,
            "portfolio_snapshot_id": s.portfolio_snapshot_id,
            "inputs": json.loads(s.inputs_json) if s.inputs_json else {},
            "outputs": json.loads(s.outputs_json) if s.outputs_json else {},
            "created_at": s.created_at.isoformat(),
        }
        for s in sims
    ]


def _index_update_into_rag(snap: PortfolioSnapshot, update: PortfolioUpdate):
    """Index an update's content into RAG for the company."""
    try:
        from app.services.rag import index_document

        # Use company_id if linked, else use portfolio_snapshot_id as the RAG key
        rag_key = snap.company_id if snap.company_id else f"portfolio_{snap.id}"
        doc_id = f"update_{update.id}"
        index_document(rag_key, doc_id, update.content)
        logger.info(f"Indexed update {update.id} into RAG for {rag_key}")
    except Exception as e:
        logger.error(f"Failed to index update into RAG: {e}")


def _parse_date(val) -> date | None:
    if not val:
        return None
    try:
        return date.fromisoformat(str(val).strip())
    except (ValueError, TypeError):
        return None
