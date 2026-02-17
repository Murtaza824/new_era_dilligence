"""
Standalone outlier probability per company (PRD latent-factor simulation).

Uses the paper's Beta distribution: first-time vs repeat founders, +1% nudge
for CA/NY and AI/FinTech/SaaS, with caps.
"""
from typing import Optional

import numpy as np

# First-time: Beta(1,6) scaled to [0.001, 0.12], mean ~1.8%
FIRST_TIME_LOW, FIRST_TIME_HIGH = 0.001, 0.12
FIRST_TIME_BETA_A, FIRST_TIME_BETA_B = 1.0, 6.0

# Repeat: Beta(1,11) scaled to [0.01, 0.20], mean ~2.6%
REPEAT_LOW, REPEAT_HIGH = 0.01, 0.20
REPEAT_BETA_A, REPEAT_BETA_B = 1.0, 11.0

NUDGE = 0.01  # +1% for CA/NY and AI/FinTech/SaaS


def compute_standalone_probability(
    sector: Optional[str] = None,
    geography: Optional[str] = None,
    founder_type: Optional[str] = None,
) -> float:
    """
    Compute standalone outlier probability from factor metadata (paper's Beta logic).

    Uses expected value of Beta (deterministic) so portfolio simulation is reproducible.
    - First-time founders: E[Beta(1,6)] scaled to [0.1%, 12%], mean ~1.8%
    - Repeat founders: E[Beta(1,11)] scaled to [1%, 20%], mean ~2.6%
    - +1% nudge for California/NY geography and AI/FinTech/SaaS sectors
    - Result is capped at the upper bound of the founder-type range.

    If founder_type is missing, defaults to first-time (conservative).
    """
    is_repeat = (founder_type or "").strip().lower() == "repeat"
    if is_repeat:
        low, high = REPEAT_LOW, REPEAT_HIGH
        mean_beta = REPEAT_BETA_A / (REPEAT_BETA_A + REPEAT_BETA_B)
    else:
        low, high = FIRST_TIME_LOW, FIRST_TIME_HIGH
        mean_beta = FIRST_TIME_BETA_A / (FIRST_TIME_BETA_A + FIRST_TIME_BETA_B)

    p = low + (high - low) * mean_beta

    sector_lower = (sector or "").strip().lower()
    if sector_lower in ("ai", "fintech", "saas"):
        p += NUDGE
    geo_lower = (geography or "").strip().lower()
    if geo_lower in ("california", "new_york"):
        p += NUDGE

    return float(np.clip(p, 0.0, high))
