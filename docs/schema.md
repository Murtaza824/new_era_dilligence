# Jarvis data schema (contract for Phase 1)

Tables below define the backend data model. No DB yet — implement in Phase 1.

## Companies

| Column     | Type   | Notes |
|-----------|--------|-------|
| id        | PK     | UUID or serial |
| name      | string | Company name |
| created_at| datetime | |
| updated_at| datetime | |

## Documents

| Column        | Type   | Notes |
|---------------|--------|-------|
| id            | PK     | |
| company_id    | FK → Companies | |
| type          | enum   | `deck` \| `call_notes` \| `website` \| `other` |
| storage_path  | string | File path or null if URL/paste |
| url           | string | Optional; for call_notes link or website |
| extracted_text| text   | Text extracted from PDF or fetched from URL |
| created_at    | datetime | |

## Memos

| Column      | Type   | Notes |
|-------------|--------|-------|
| id          | PK     | |
| company_id  | FK → Companies | |
| version     | int    | Increment on each full regenerate or revise |
| content     | text   | Markdown or JSON (sections) |
| created_at  | datetime | |
| created_by  | string | User id or "system" |

## MemoRevisions (audit trail)

| Column   | Type   | Notes |
|----------|--------|-------|
| id       | PK     | |
| memo_id  | FK → Memos | |
| content  | text   | Full content or diff at revision |
| created_at | datetime | |
| created_by | string | User id |

## PortfolioSnapshot

| Column            | Type   | Notes |
|-------------------|--------|-------|
| id                | PK     | |
| company_name     | string | |
| one_liner         | string | |
| website           | string | |
| investment_stage  | string | Pre-Seed, Seed, First Check, etc. |
| investment_size   | decimal | Dollar amount |
| entry_valuation  | decimal | Post-money at entry |
| last_valuation   | decimal | Latest known |
| ownership_pct    | decimal | e.g. 0.25 for 0.25% |
| investment_date  | date   | |
| imported_at      | datetime | When we loaded this row |

## SimulationRuns

| Column     | Type   | Notes |
|------------|--------|-------|
| id         | PK     | |
| company_id | FK → Companies | Optional if run for "prospective" only |
| inputs_json | JSON  | Entry valuation, ownership, scenarios, etc. |
| outputs_json| JSON  | monte_carlo, impact_score, scenarios |
| created_at | datetime | |
