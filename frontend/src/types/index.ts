// ── Auth ───────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  role: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

// ── Backend data types matching Pydantic schemas ─────────────────────────

export interface Company {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  document_count: number;
  has_memo: boolean;
}

export interface Document {
  id: string;
  company_id: string;
  type: "deck" | "call_notes" | "website" | "other";
  status: "processing" | "ready" | "error";
  url: string | null;
  created_at: string;
}

export interface MemoSection {
  title: string;
  content: string;
}

export interface Memo {
  id: string;
  company_id: string;
  version: number;
  content: string;
  sections: MemoSection[];
  created_at: string;
  created_by: string;
}

// ── Simulations ──────────────────────────────────────────────────────────

export interface SimulationRun {
  id: string;
  company_id: string | null;
  inputs: SimulationInputs;
  outputs: SimulationOutputs;
  created_at: string;
}

export interface SimulationInputs {
  entry_valuation: number;
  ownership_pct: number;
  check_size: number;
  fund_size: number;
  exit_multiple_mean: number;
  exit_multiple_std: number;
  years_to_exit: number;
}

export interface SimulationOutputs {
  monte_carlo: MonteCarlo;
  scenarios: Scenario[];
  impact_score: number;
}

export interface MonteCarlo {
  num_simulations: number;
  percentiles: Record<string, { exit_valuation: number; return: number; moic: number; fund_return_pct: number }>;
  histogram: { bucket: string; count: number }[];
  mean_moic: number;
  median_moic: number;
  mean_return: number;
  mean_fund_return_pct: number;
  prob_loss: number;
  prob_2x: number;
  prob_5x: number;
  prob_10x: number;
}

export interface Scenario {
  name: string;
  probability: number;
  exit_multiple: number;
  exit_valuation: number;
  return: number;
  moic: number;
  fund_return_pct: number;
}

export interface SimulationSuggestion {
  entry_valuation: number;
  ownership_pct: number;
  check_size: number;
  fund_size: number;
  exit_multiple_mean: number;
  exit_multiple_std: number;
  years_to_exit: number;
  scenarios: { name: string; probability: number; exit_multiple: number }[];
  rationale: string;
}

// ── Portfolio ────────────────────────────────────────────────────────────

export interface PortfolioSnapshot {
  id: string;
  company_id: string | null;
  company_name: string;
  one_liner: string | null;
  website: string | null;
  investment_stage: string | null;
  investment_size: number | null;
  entry_valuation: number | null;
  last_valuation: number | null;
  ownership_pct: number | null;
  investment_date: string | null;
  imported_at: string;
  sector: string | null;
  geography: string | null;
  founder_type: string | null;
  outlier_probability: number | null;
  effective_outlier_probability: number | null;
}

/** Per-company result from portfolio simulation (who is likely an outlier and why) */
export interface PortfolioSimulationCompany {
  company_id: string | null;
  company_name: string;
  standalone_probability: number;
  marginal_outlier_probability: number;
  sector: string | null;
  geography: string | null;
  founder_type: string | null;
  reason: string;
}

/** Result of portfolio-level latent-factor simulation */
export interface PortfolioSimulationOutputs {
  p_zero_outliers: number;
  p_at_most_one: number;
  p_at_most_two: number;
  expected_outliers: number;
  expected_outliers_given_ge_1: number;
  expected_outliers_given_ge_2: number;
  outlier_count_distribution: Record<number, number>;
  diversification_score: number;
  num_simulations: number;
  num_companies: number;
  per_company_probabilities: number[];
  per_company: PortfolioSimulationCompany[];
}

export interface PortfolioSimulationLatest {
  run: { id: string; created_at: string; trigger: string } | null;
  outputs: PortfolioSimulationOutputs | null;
}

export interface PortfolioUpdateEntry {
  id: string;
  portfolio_snapshot_id: string;
  content: string;
  source: string | null;
  created_at: string;
  created_by: string;
}
