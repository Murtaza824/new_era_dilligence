"""
Monte Carlo simulation engine for fund impact analysis.

Given investment parameters, runs simulations to estimate:
- Distribution of potential returns
- Fund impact (return as % of fund)
- Scenario analysis (bear / base / bull)
"""
import logging
import numpy as np
from scipy import stats

logger = logging.getLogger(__name__)

DEFAULT_NUM_SIMULATIONS = 10_000
DEFAULT_FUND_SIZE = 5_000_000  # $5M fund


def run_simulation(
    entry_valuation: float,
    ownership_pct: float,
    check_size: float,
    fund_size: float = DEFAULT_FUND_SIZE,
    exit_multiple_mean: float = 10.0,
    exit_multiple_std: float = 8.0,
    years_to_exit: int = 7,
    scenarios: list[dict] | None = None,
    num_simulations: int = DEFAULT_NUM_SIMULATIONS,
) -> dict:
    """
    Run a Monte Carlo simulation.

    Args:
        entry_valuation: Post-money valuation at entry ($)
        ownership_pct: Ownership percentage (e.g. 5.0 for 5%)
        check_size: Investment amount ($)
        fund_size: Total fund size ($)
        exit_multiple_mean: Mean exit multiple on entry valuation
        exit_multiple_std: Std dev of exit multiple
        years_to_exit: Expected years to liquidity
        scenarios: Optional bear/base/bull scenario overrides
        num_simulations: Number of Monte Carlo runs

    Returns:
        Dict with monte_carlo results, scenarios, and impact_score.
    """
    ownership_frac = ownership_pct / 100.0

    # ── Monte Carlo ──────────────────────────────────────────────────────
    # Use a log-normal distribution for exit multiples (can't go below 0)
    # Convert mean/std of the normal to log-normal parameters
    mu, sigma = _lognormal_params(exit_multiple_mean, exit_multiple_std)
    exit_multiples = np.random.lognormal(mu, sigma, num_simulations)

    exit_valuations = entry_valuation * exit_multiples
    returns = exit_valuations * ownership_frac
    moics = returns / check_size
    fund_return_pcts = (returns / fund_size) * 100  # as % of fund

    # Percentiles
    percentiles = {}
    for p in [5, 10, 25, 50, 75, 90, 95]:
        percentiles[f"p{p}"] = {
            "exit_valuation": float(np.percentile(exit_valuations, p)),
            "return": float(np.percentile(returns, p)),
            "moic": float(np.percentile(moics, p)),
            "fund_return_pct": float(np.percentile(fund_return_pcts, p)),
        }

    # Histogram buckets for charting
    hist_counts, hist_edges = np.histogram(moics, bins=30)
    histogram = [
        {"bucket": f"{hist_edges[i]:.1f}–{hist_edges[i+1]:.1f}x", "count": int(hist_counts[i])}
        for i in range(len(hist_counts))
    ]

    # Probability of outcomes
    prob_loss = float(np.mean(moics < 1.0))
    prob_2x = float(np.mean(moics >= 2.0))
    prob_5x = float(np.mean(moics >= 5.0))
    prob_10x = float(np.mean(moics >= 10.0))

    monte_carlo = {
        "num_simulations": num_simulations,
        "percentiles": percentiles,
        "histogram": histogram,
        "mean_moic": float(np.mean(moics)),
        "median_moic": float(np.median(moics)),
        "mean_return": float(np.mean(returns)),
        "mean_fund_return_pct": float(np.mean(fund_return_pcts)),
        "prob_loss": prob_loss,
        "prob_2x": prob_2x,
        "prob_5x": prob_5x,
        "prob_10x": prob_10x,
    }

    # ── Scenario analysis ────────────────────────────────────────────────
    if not scenarios:
        scenarios = _default_scenarios(entry_valuation, ownership_frac, check_size, fund_size)
    else:
        # Enrich user-provided scenarios with computed fields
        scenarios = [
            _compute_scenario(s, ownership_frac, check_size, fund_size)
            for s in scenarios
        ]

    # ── Impact score ─────────────────────────────────────────────────────
    # Probability-weighted expected return as % of fund
    impact_score = float(np.mean(fund_return_pcts))

    return {
        "monte_carlo": monte_carlo,
        "scenarios": scenarios,
        "impact_score": impact_score,
        "inputs": {
            "entry_valuation": entry_valuation,
            "ownership_pct": ownership_pct,
            "check_size": check_size,
            "fund_size": fund_size,
            "exit_multiple_mean": exit_multiple_mean,
            "exit_multiple_std": exit_multiple_std,
            "years_to_exit": years_to_exit,
        },
    }


def _lognormal_params(mean: float, std: float):
    """Convert desired mean/std of a distribution to log-normal mu/sigma."""
    # Clamp std to avoid numerical issues
    std = max(std, 0.1)
    variance = std ** 2
    mu = np.log(mean ** 2 / np.sqrt(variance + mean ** 2))
    sigma = np.sqrt(np.log(1 + variance / mean ** 2))
    return float(mu), float(sigma)


def _default_scenarios(entry_val, ownership_frac, check_size, fund_size):
    """Generate default bear/base/bull scenarios."""
    cases = [
        {"name": "Bear", "probability": 0.25, "exit_multiple": 1.5},
        {"name": "Base", "probability": 0.50, "exit_multiple": 5.0},
        {"name": "Bull", "probability": 0.25, "exit_multiple": 15.0},
    ]
    return [_compute_scenario(
        {"name": c["name"], "probability": c["probability"], "exit_multiple": c["exit_multiple"]},
        ownership_frac, check_size, fund_size,
        entry_val=entry_val,
    ) for c in cases]


def _compute_scenario(scenario: dict, ownership_frac: float, check_size: float,
                      fund_size: float, entry_val: float | None = None) -> dict:
    """Add computed return fields to a scenario."""
    exit_mult = scenario.get("exit_multiple", 5.0)
    exit_val = scenario.get("exit_valuation") or (entry_val * exit_mult if entry_val else 0)
    ret = exit_val * ownership_frac
    moic = ret / check_size if check_size > 0 else 0
    fund_pct = (ret / fund_size) * 100 if fund_size > 0 else 0

    return {
        "name": scenario.get("name", "Custom"),
        "probability": scenario.get("probability", 0.33),
        "exit_multiple": exit_mult,
        "exit_valuation": exit_val,
        "return": ret,
        "moic": moic,
        "fund_return_pct": fund_pct,
    }
