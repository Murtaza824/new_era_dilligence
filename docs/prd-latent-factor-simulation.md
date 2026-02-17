# PRD: Correlated Portfolio Simulation — Latent Factor Model

Based on "Probabilistic Modeling of Venture Capital Portfolio Outliers" (Sakamoto, Koyluoglu, Alican, Ihlamur — Feb 2026).

---

## 1. Paper Summary & Key Learnings

### Core Idea

The paper adapts credit-risk latent-factor models (Vasicek 1987, Koyluoglu & Hickman 1998) to venture capital. Instead of treating each investment independently, it models **correlated outcomes** across a portfolio using shared latent factors (sector, geography, founder type). A company becomes an "outlier" when its latent Gaussian variable exceeds a threshold set by its standalone probability.

### Key Findings

1. **Expected outlier counts are insufficient** — Two portfolios with the same expected number of outliers can have drastically different P(zero outliers). Correlation makes the tails fatter.
2. **Correlation raises the probability of total wipeout** — For a 40-deal portfolio at 4% individual success, P(zero outliers) jumps from 19.6% (independent) to 32.4% (correlated single-factor) to 32.5% (multi-factor).
3. **Diversification reduces left-tail risk but caps upside** — Spreading across sectors lowers P(zero outliers), but reduces expected outliers conditional on clearing a threshold (fewer "clustered success" events).
4. **Correlation-aware diversification beats naive diversification** — Healthcare is weakly correlated with other sectors; overweighting it reduces portfolio risk more than equal-weighting all sectors, even if healthcare has slightly lower standalone success.
5. **Deal quality improvements face diminishing returns under correlation** — Doubling standalone probability only gradually reduces P(zero outliers) when correlation is present.
6. **Portfolio size has diminishing risk reduction** — Adding more deals scales expected outliers linearly but barely dents left-tail risk once correlation is factored in.

### The Math

**Latent variable per company i:**

```
A_i = w_i^T * Z + sqrt(1 - w_i^T * Sigma * w_i) * epsilon_i
```

Where:
- `Z ~ N(0, Sigma)` is the vector of shared factor returns
- `epsilon_i ~ N(0, 1)` is idiosyncratic noise
- `w_i` is the factor loading vector for company i
- `Sigma` is the correlation matrix across factors

**Outlier threshold:** Company i is an outlier if `A_i > Phi^{-1}(1 - p_i)` where `p_i` is standalone outlier probability.

**Factor loading construction:**
- Factor weights: S=0.6 (sector), G=0.3 (geography), F=0.1 (founder type), S+G+F=1
- `w_0` is calibrated so average pairwise correlation ~ 0.12
- For company with sector s, geography g, founder f: `r_i = [sqrt(S), sqrt(G), sqrt(F)]` in the corresponding slots
- Normalized: `b_i = r_i / sqrt(r_i^T * Sigma * r_i)`, then `w_i = w_0 * b_i`

**Standalone probability assignment (from paper):**
- First-time founders: Beta(1,6) on [0.1%, 12%], mean ~1.8%
- Repeat founders: Beta(1,11) on [1%, 20%], mean ~2.6%
- +1% nudge for California/NY geography, and AI/FinTech/SaaS sectors
- Capped at upper bounds

**Simulation:** Cholesky decomposition `Sigma = L * L^T`, sample `X ~ N(0,I)`, compute `Z = L * X`, then compute each `A_i` and check threshold.

---

## 2. What Changes

### Current State

Our simulation in `backend/app/services/simulation.py` runs per-company:
- Log-normal distribution for exit multiples
- Produces MOIC distribution, percentiles, P(loss), P(5x), P(10x)
- No cross-company correlation
- No portfolio-level analysis

### Proposed State

We keep the existing per-company simulation (it is useful for individual deal analysis) and **add a new portfolio-level simulation** that uses the latent-factor model:
- Models all portfolio companies simultaneously in each Monte Carlo iteration
- Introduces factor metadata per company (sector, geography, founder type)
- Uses empirical correlation matrix across factors
- Outputs portfolio-level metrics: P(0 outliers), P(at most 1), P(at most 2), conditional expectations, diversification score

---

## 3. Scope

### In Scope

- **Factor metadata** on portfolio companies: sector, geography, founder type (new fields on `PortfolioSnapshot`)
- **Standalone outlier probability** per company: derived from factor metadata using the paper's Beta distribution approach, or user-overridable
- **Correlation matrix**: hardcoded initial matrix (11 factors), with ability to update later
- **Portfolio simulation engine**: new `run_portfolio_simulation()` that implements the latent-factor Monte Carlo
- **Portfolio-level metrics**: P(0 outliers), P(<=1 outlier), P(<=2 outliers), E[outliers], E[outliers | outliers >= k], diversification score
- **Frontend**: portfolio-level simulation card on the portfolio list page; per-company outlier probability display on portfolio detail

### Out of Scope

- Time-varying correlation matrices (paper Section 6.2 — future work)
- Heavy-tailed latent factors (Student-t extension — future work)
- Multi-sector affiliations per company
- Real-time market data for dynamic correlation updates

---

## 4. Data Model Changes

### PortfolioSnapshot — New Fields

Add to `backend/app/models/portfolio.py`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sector` | String, nullable | null | One of: "ai", "fintech", "healthcare", "consumer", "saas", "other" |
| `geography` | String, nullable | null | One of: "california", "new_york", "massachusetts", "other_us", "international" |
| `founder_type` | String, nullable | null | One of: "first_time", "repeat" |
| `outlier_probability` | Float, nullable | null | Override standalone outlier probability (if null, derived from factors) |

### New Table: PortfolioSimulationRun

| Field | Type | Description |
|-------|------|-------------|
| `id` | String PK | UUID |
| `inputs_json` | Text | JSON: portfolio composition, factor settings, num_simulations |
| `outputs_json` | Text | JSON: full portfolio-level results |
| `created_at` | DateTime | Timestamp |
| `trigger` | String | "manual" or "scheduled" |

---

## 5. Implementation Plan

### Phase 1: Factor metadata and standalone probabilities

**Backend:**
- Add `sector`, `geography`, `founder_type`, `outlier_probability` columns to `PortfolioSnapshot`
- Update `backend/app/schemas/portfolio.py` with new fields in `PortfolioSnapshotOut`, `PortfolioCreateRequest`, `PortfolioUpdateRequest`
- Add a utility function `compute_standalone_probability(sector, geography, founder_type)` in a new file `backend/app/services/outlier_probability.py` that implements the paper's Beta distribution logic:
  - First-time founders: scaled Beta(1,6) on [0.001, 0.12], mean ~1.8%
  - Repeat founders: scaled Beta(1,11) on [0.01, 0.20], mean ~2.6%
  - +1% nudge for california/new_york geography and ai/fintech/saas sectors
  - Capped at upper bounds

**Frontend:**
- Add sector/geography/founder-type dropdowns to the portfolio detail page (editable)
- Display derived or overridden outlier probability on the portfolio detail card

### Phase 2: Correlation matrix and portfolio simulation engine

**Backend:**
- Create `backend/app/services/portfolio_simulation.py` with:
  - Hardcoded 11x11 correlation matrix `SIGMA` (5 sectors + 4 geographies + 2 founder types = 11 factors)
  - Factor groups enum
  - `compute_factor_loadings(companies)` — builds `w_i` vectors per company
  - `run_portfolio_simulation(companies, num_simulations=100_000)` implementing:
    1. For each company: compute `p_i` (standalone prob), `w_i` (factor loadings), threshold `Phi^{-1}(1-p_i)`
    2. Cholesky decompose `Sigma = L * L^T`
    3. For each Monte Carlo iteration: sample `X ~ N(0,I)`, compute `Z = L*X`, compute each `A_i`, check threshold
    4. Count outliers per iteration
  - Output: distribution of outlier counts, P(U=0), P(U<=1), P(U<=2), E[U], E[U|U>=k], per-company marginal outlier prob
- Factor weight constants: S=0.6, G=0.3, F=0.1
- `w_0` calibrated so mean pairwise correlation ~ 0.12

### Phase 3: API and frontend

**Backend:**
- New endpoint: `POST /portfolio/simulate-portfolio` — runs portfolio-level simulation across all portfolio companies with factor data
- New endpoint: `GET /portfolio/simulation/latest` — returns most recent portfolio sim result
- New model: `PortfolioSimulationRun` (stores inputs/outputs)

**Frontend:**
- New **Portfolio Health** card on the portfolio list page showing:
  - P(zero outliers) with color coding (red if high, green if low)
  - Expected outlier count
  - Diversification score (derived from average correlation)
  - "Run Portfolio Simulation" button
  - Last run timestamp
- On the portfolio detail page, show each company's standalone outlier probability
- Add a **"What-If" mode**: user can toggle a company's sector/geography and see how portfolio metrics shift (stretch goal)

---

## 6. Correlation Matrix (Initial Values)

From the paper's Figure 1, the 11x11 matrix covers:
- Sectors: AI, FinTech, Healthcare, Consumer, SaaS
- Geography: California, New York, Massachusetts, Other US
- Founder type: First-time, Repeat

The matrix will be hardcoded initially. Key patterns from the paper:
- Healthcare has weak correlation with other sectors (~0.1-0.3)
- AI and California are strongly correlated (~0.7+)
- First-time and repeat founders are highly correlated with each other (~0.8+)
- Cross-category correlations (sector vs geography) are moderate (~0.3-0.5)

Since exact numerical values are not fully provided in the paper text (only a heatmap in Figure 1), we will estimate reasonable values consistent with the paper's qualitative observations and calibrate `w_0` to achieve ~0.12 average pairwise correlation.

---

## 7. Key Metrics Explained

| Metric | Meaning | Why It Matters |
|--------|---------|---------------|
| P(U=0) | Probability of zero outliers in the portfolio | Core risk metric — "will the fund return at all?" |
| P(U<=1) | Probability of at most one outlier | Fund may not return capital with only one |
| P(U<=2) | Probability of at most two outliers | Marginal fund performance territory |
| E[U] | Expected number of outliers | Baseline expectation (but insufficient alone per the paper) |
| E[U\|U>=k] | Expected outliers given at least k occur | Measures "conditional upside" — how big the wins cluster |
| Diversification score | 1 - (mean pairwise correlation / max possible) | Higher = more diversified factor exposure |

---

## 8. How This Connects to Existing Features

- **Per-company sim** (existing): Remains unchanged. Still runs exit-multiple Monte Carlo for individual deal analysis (MOIC, fund impact). Available from company detail and portfolio detail.
- **Portfolio sim** (new): Runs across all portfolio companies simultaneously. Uses factor model for correlated outcomes. Answers "how likely is the *fund* to have outliers?" rather than "how likely is *this deal* to return 10x?"
- **Updates/RAG**: The AI-suggest logic for per-company simulations already reads from RAG. In a future iteration, RAG context could inform standalone probability overrides (e.g., "CEO just raised Series A from a16z" -> bump probability).

---

## 9. Success Criteria

- Portfolio simulation runs across all 9 portfolio companies and produces P(U=0), P(U<=1), P(U<=2), E[U] that are consistent with the paper's findings (e.g., for a ~9-deal portfolio at ~3% avg probability, P(U=0) should be meaningfully higher under the correlated model than the independent model).
- Users can set sector, geography, founder type per company and see how portfolio risk changes.
- The portfolio health card makes it immediately clear whether the fund is well-diversified or over-concentrated.
- Per-company outlier probability is visible and editable.
