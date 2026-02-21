// ── Activity / Agent jobs ───────────────────────────────────────────────

export interface AgentJob {
  id: string;
  type: string;
  entity_type: string;
  entity_id: string;
  status: "pending" | "running" | "completed" | "failed";
  message: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
  entity_label: string | null;
  triggered_by_user_id: string | null;
  triggered_by_user_email: string | null;
  duration_seconds: number | null;
}

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

export interface DealflowFounderBrief {
  id: string;
  name: string;
  linkedin_url: string | null;
  twitter_url: string | null;
  email: string | null;
}

export interface Company {
  id: string;
  name: string;
  website: string | null;
  logo_url: string | null;
  entry_valuation: number | null;
  amount_raising: number | null;
  investment_stage: string | null;
  one_liner: string | null;
  location: string | null;
  notes: string | null;
  source_type: string | null;
  source_detail: string | null;
  company_linkedin_url: string | null;
  created_at: string;
  updated_at: string;
  document_count: number;
  has_memo: boolean;
  dealflow_founders: DealflowFounderBrief[];
}

export interface DealSuggestions {
  entry_valuation: number | null;
  amount_raising: number | null;
  investment_stage: string | null;
}

export interface Document {
  id: string;
  company_id: string;
  type: "deck" | "call_notes" | "website" | "other";
  status: "processing" | "ready" | "error";
  url: string | null;
  original_filename: string | null;
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
  /** When ownership_pct is null, backend computes (investment_size / entry_valuation) * 100 */
  effective_ownership_pct: number | null;
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

// ── Network (contacts + introduction suggestions) ─────────────────────────

export interface NetworkContact {
  id: string;
  name: string;
  email: string | null;
  phone_number: string | null;
  location: string | null;
  company_name: string | null;
  role_or_title: string | null;
  linkedin_url: string | null;
  skills: string | null;
  notes: string | null;
  tags: string | null;
  nev_fund_i_lp: boolean;
  nev_syndicate_lp: boolean;
  added_by_user_id: string;
  profile_pic_url: string | null;
  related_companies: string | null;
  stage: string | null;
  vc_firm_name: string | null;
  startup_name: string | null;
  investor_check_size: string | null;
  introductions_made: string | null;
  introduced_us_to: string | null;
  interested_lp: boolean;
  investor_in: string | null;
  warm: boolean;
  syndicate_member: boolean;
  quarterly_update_list: boolean;
  notes_2: string | null;
  intros_made_for_us: number;
  intros_we_made: number;
  check_sizes: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntroductionSuggestion {
  id: string;
  network_contact_id: string;
  target_type: "company" | "portfolio";
  target_company_id: string | null;
  target_portfolio_id: string | null;
  introduction_type: string;
  reason_summary: string | null;
  status: "suggested" | "introduced" | "dismissed";
  created_by_trigger: string | null;
  created_at: string;
  updated_at: string;
  contact_name: string | null;
  target_company_name: string | null;
  target_portfolio_name: string | null;
}

// ── Dealflow ────────────────────────────────────────────────────────────────

export interface DealflowFounder {
  id: string;
  dealflow_entry_id: string;
  name: string;
  linkedin_url: string | null;
  twitter_url: string | null;
  email: string | null;
}

export interface DealflowEntry {
  id: string;
  name: string;
  website: string | null;
  company_linkedin_url: string | null;
  one_liner: string | null;
  location: string | null;
  stage: string | null;
  amount_raising: number | null;
  valuation: number | null;
  notes: string | null;
  source_type: string | null;
  source_detail: string | null;
  status: string;
  added_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  founders: DealflowFounder[];
  document_count: number;
  promoted_company_id: string | null;
}

export interface DealflowDocument {
  id: string;
  dealflow_entry_id: string;
  type: string;
  status: string;
  url: string | null;
  original_filename: string | null;
  created_at: string;
}
