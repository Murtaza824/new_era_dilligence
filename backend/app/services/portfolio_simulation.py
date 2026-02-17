"""
Portfolio-level latent-factor simulation (PRD).

Correlated outlier outcomes via shared factors (sector, geography, founder type).
A_i = w_i^T Z + sqrt(1 - w_i^T Sigma w_i) * epsilon_i; outlier if A_i > Phi^{-1}(1 - p_i).
"""
from __future__ import annotations

from typing import Any

import numpy as np
from scipy.stats import norm

from app.services.outlier_probability import compute_standalone_probability

# Factor weight constants (S + G + F = 1)
SECTOR_W = 0.6
GEO_W = 0.3
FOUNDER_W = 0.1

# 11 factors: 5 sectors, 4 geographies, 2 founder types
# Indices: AI=0, FinTech=1, Healthcare=2, Consumer=3, SaaS=4,
#          California=5, New York=6, Massachusetts=7, Other US=8,
#          First-time=9, Repeat=10
SECTOR_IDS = {"ai": 0, "fintech": 1, "healthcare": 2, "consumer": 3, "saas": 4, "other": None}
GEO_IDS = {"california": 5, "new_york": 6, "massachusetts": 7, "other_us": 8, "international": None}
FOUNDER_IDS = {"first_time": 9, "repeat": 10}
N_FACTORS = 11

# Hardcoded 11x11 correlation matrix (paper-inspired: healthcare weak, AI-CA strong, founder high)
_SIGMA = np.array([
    [1.0, 0.5, 0.2, 0.4, 0.55, 0.72, 0.5, 0.35, 0.3, 0.4, 0.35],   # AI
    [0.5, 1.0, 0.25, 0.45, 0.5, 0.5, 0.6, 0.3, 0.25, 0.35, 0.3],   # FinTech
    [0.2, 0.25, 1.0, 0.2, 0.25, 0.2, 0.2, 0.25, 0.2, 0.25, 0.2],   # Healthcare
    [0.4, 0.45, 0.2, 1.0, 0.4, 0.35, 0.4, 0.3, 0.35, 0.35, 0.3],   # Consumer
    [0.55, 0.5, 0.25, 0.4, 1.0, 0.55, 0.45, 0.35, 0.35, 0.4, 0.35], # SaaS
    [0.72, 0.5, 0.2, 0.35, 0.55, 1.0, 0.55, 0.4, 0.4, 0.4, 0.35],  # California
    [0.5, 0.6, 0.2, 0.4, 0.45, 0.55, 1.0, 0.4, 0.35, 0.35, 0.3],   # New York
    [0.35, 0.3, 0.25, 0.3, 0.35, 0.4, 0.4, 1.0, 0.5, 0.35, 0.3],   # Massachusetts
    [0.3, 0.25, 0.2, 0.35, 0.35, 0.4, 0.35, 0.5, 1.0, 0.3, 0.3],   # Other US
    [0.4, 0.35, 0.25, 0.35, 0.4, 0.4, 0.35, 0.35, 0.3, 1.0, 0.85], # First-time
    [0.35, 0.3, 0.2, 0.3, 0.35, 0.35, 0.3, 0.3, 0.3, 0.85, 1.0],   # Repeat
], dtype=np.float64)
# Symmetrize and ensure PSD
SIGMA = (_SIGMA + _SIGMA.T) / 2
np.fill_diagonal(SIGMA, 1.0)
# Calibrate w_0 so mean pairwise correlation across portfolio ~ 0.12 (paper)
# Mean pairwise corr = (1/(n*n)) * sum_ij w_i^T Sigma w_j; with normalized b_i, scale by w_0^2
# We set w_0 so that typical loadings yield ~0.12 (tuned empirically)
W_0 = 0.42


def _norm_vec(x: np.ndarray) -> np.ndarray:
    n = np.sqrt(np.maximum(np.sum(x * x), 1e-12))
    return x / n if n > 0 else x


def compute_factor_loadings(
    companies: list[dict[str, Any]],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Build factor loading vectors w_i for each company.

    companies: list of dicts with sector, geography, founder_type (optional).
    Returns: (W, p, thresholds) where
      W is (n_companies, n_factors), p is (n_companies,) standalone probs,
      thresholds is (n_companies,) = Phi^{-1}(1 - p_i).
    """
    n = len(companies)
    W = np.zeros((n, N_FACTORS))
    p = np.zeros(n)

    for i, c in enumerate(companies):
        sector = (c.get("sector") or "").strip().lower() or None
        geography = (c.get("geography") or "").strip().lower() or None
        founder_type = (c.get("founder_type") or "").strip().lower() or None
        override = c.get("outlier_probability")
        if override is not None:
            p[i] = float(override)
        else:
            p[i] = compute_standalone_probability(sector, geography, founder_type)

        # r_i: weight in corresponding factor slot
        r = np.zeros(N_FACTORS)
        sid = SECTOR_IDS.get(sector) if sector else None
        if sid is not None:
            r[sid] = np.sqrt(SECTOR_W)
        gid = GEO_IDS.get(geography) if geography else None
        if gid is not None:
            r[gid] = np.sqrt(GEO_W)
        fid = FOUNDER_IDS.get(founder_type) if founder_type else None
        if fid is not None:
            r[fid] = np.sqrt(FOUNDER_W)

        r_sigma_r = float(r @ SIGMA @ r)
        if r_sigma_r > 1e-12:
            b = r / np.sqrt(r_sigma_r)
            W[i] = W_0 * b
        # else W[i] stays 0 (no factor exposure)

    # Threshold: company i is outlier if A_i > Phi^{-1}(1 - p_i)
    thresholds = norm.ppf(1.0 - np.clip(p, 1e-6, 1 - 1e-6))
    return W, p, thresholds


def run_portfolio_simulation(
    companies: list[dict[str, Any]],
    num_simulations: int = 100_000,
    *,
    rng: np.random.Generator | None = None,
) -> dict[str, Any]:
    """
    Run latent-factor Monte Carlo: sample Z, compute A_i, count outliers per run.

    Returns distribution of outlier counts, P(U=0), P(U<=1), P(U<=2), E[U],
    E[U|U>=k], optional diversification score.
    """
    if rng is None:
        rng = np.random.default_rng()
    if not companies:
        return _empty_result()

    W, p, thresholds = compute_factor_loadings(companies)
    n = len(companies)

    # Idiosyncratic variance: var(A_i) = w_i^T Sigma w_i + (1 - w_i^T Sigma w_i) = 1
    # A_i = W_i^T Z + sqrt(1 - W_i^T Sigma W_i) * eps_i
    w_sigma_w = np.sum(W * (SIGMA @ W.T).T, axis=1)
    idio_std = np.sqrt(np.maximum(1.0 - w_sigma_w, 1e-12))

    try:
        L = np.linalg.cholesky(SIGMA)
    except np.linalg.LinAlgError:
        L = np.linalg.cholesky(SIGMA + 1e-6 * np.eye(N_FACTORS))

    outlier_counts = np.zeros(num_simulations, dtype=np.int32)
    outlier_hits = np.zeros((n, num_simulations), dtype=np.bool_)  # per-company marginal
    Z_cache = (L @ rng.standard_normal((N_FACTORS, num_simulations))).T  # (num_sim, 11)

    for i in range(n):
        mean_i = Z_cache @ W[i]
        eps_i = rng.standard_normal(num_simulations)
        A_i = mean_i + idio_std[i] * eps_i
        hits = A_i > thresholds[i]
        outlier_hits[i] = hits
        outlier_counts += hits.astype(np.int32)

    # Per-company marginal P(outlier) and "why" explanation
    marginal = np.mean(outlier_hits, axis=1)
    per_company = _build_per_company_results(companies, p, marginal)

    # Metrics
    u = outlier_counts
    p0 = np.mean(u == 0)
    p1 = np.mean(u <= 1)
    p2 = np.mean(u <= 2)
    e_u = float(np.mean(u))
    cond_1 = u[u >= 1]
    e_u_given_ge_1 = float(np.mean(cond_1)) if len(cond_1) > 0 else 0.0
    cond_2 = u[u >= 2]
    e_u_given_ge_2 = float(np.mean(cond_2)) if len(cond_2) > 0 else 0.0

    # Distribution of outlier counts
    max_u = int(np.max(u))
    dist = {int(k): int(np.sum(u == k)) for k in range(max_u + 1)}

    # Diversification: 1 - (mean pairwise correlation / max possible)
    mean_pairwise = float(np.mean(w_sigma_w)) if n else 0.0
    diversification_score = max(0.0, 1.0 - mean_pairwise)

    return {
        "p_zero_outliers": round(p0, 6),
        "p_at_most_one": round(p1, 6),
        "p_at_most_two": round(p2, 6),
        "expected_outliers": round(e_u, 4),
        "expected_outliers_given_ge_1": round(e_u_given_ge_1, 4),
        "expected_outliers_given_ge_2": round(e_u_given_ge_2, 4),
        "outlier_count_distribution": dist,
        "diversification_score": round(diversification_score, 4),
        "num_simulations": num_simulations,
        "num_companies": n,
        "per_company_probabilities": [round(x, 6) for x in p.tolist()],
        "per_company": per_company,
    }


def _reason_for_company(
    standalone_p: float,
    sector: str | None,
    geography: str | None,
    founder_type: str | None,
) -> str:
    """One-line explanation for why this company is a likely outlier (or not)."""
    parts = []
    if standalone_p >= 0.04:
        parts.append(f"high standalone ({standalone_p * 100:.1f}%)")
    elif standalone_p >= 0.02:
        parts.append(f"moderate standalone ({standalone_p * 100:.1f}%)")
    else:
        parts.append(f"low standalone ({standalone_p * 100:.1f}%)")
    elev = []
    if sector and sector in ("ai", "fintech", "saas"):
        elev.append(sector)
    if geography and geography in ("california", "new_york"):
        elev.append(geography.replace("_", " "))
    if elev:
        parts.append(f"{', '.join(elev)} (elevated correlation)")
    if founder_type == "repeat":
        parts.append("repeat founder")
    return "; ".join(parts).capitalize()


def _build_per_company_results(
    companies: list[dict[str, Any]],
    p: np.ndarray,
    marginal: np.ndarray,
) -> list[dict[str, Any]]:
    out = []
    for i, c in enumerate(companies):
        sector = (c.get("sector") or "").strip().lower() or None
        geography = (c.get("geography") or "").strip().lower() or None
        founder_type = (c.get("founder_type") or "").strip().lower() or None
        rag_rationale = (c.get("rag_rationale") or "").strip() or None
        if rag_rationale:
            reason = rag_rationale
        else:
            reason = _reason_for_company(p[i], sector, geography, founder_type)
        out.append({
            "company_id": c.get("id"),
            "company_name": c.get("company_name", ""),
            "standalone_probability": round(float(p[i]), 6),
            "marginal_outlier_probability": round(float(marginal[i]), 6),
            "sector": sector,
            "geography": geography,
            "founder_type": founder_type,
            "reason": reason,
        })
    # Sort by marginal (most likely outlier first)
    out.sort(key=lambda x: x["marginal_outlier_probability"], reverse=True)
    return out


def _empty_result() -> dict[str, Any]:
    return {
        "p_zero_outliers": 1.0,
        "p_at_most_one": 1.0,
        "p_at_most_two": 1.0,
        "expected_outliers": 0.0,
        "expected_outliers_given_ge_1": 0.0,
        "expected_outliers_given_ge_2": 0.0,
        "outlier_count_distribution": {},
        "diversification_score": 1.0,
        "num_simulations": 0,
        "num_companies": 0,
        "per_company_probabilities": [],
        "per_company": [],
    }
