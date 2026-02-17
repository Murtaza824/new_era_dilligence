# Jarvis API contract

Endpoints to implement. Request/response shapes in plain English or minimal JSON.

## Health

- **GET /health** — No body. Response: `{ "status": "ok" }`.

## Companies

- **POST /companies** — Body: `{ "name": "string" }`. Response: company object (id, name, created_at, updated_at).
- **GET /companies** — No body. Response: list of company objects.
- **GET /companies/:id** — Response: company object plus optional list of documents, latest memo, latest simulation.
- **POST /companies/:id/documents** — Multipart (file for deck) or JSON: `{ "type": "call_notes"|"website", "content"?: "string", "url"?: "string" }`. Response: document object (id, type, status, created_at).

## Memo

- **POST /companies/:id/memo/generate** — Trigger full memo generation (section agents + orchestrator). Response: job id or 202 + poll URL; or sync memo object when done.
- **GET /companies/:id/memo** — Response: latest memo (version, content, created_at, created_by).
- **POST /companies/:id/memo/revise** — Add new docs and re-run; optional body. Response: new memo version.
- **GET /companies/:id/memo/export?format=pdf** — Response: PDF (or DOCX) file.

## Simulations

- **POST /companies/:id/simulate** — Body: optional overrides (entry_valuation, ownership_pct, etc.). Response: simulation run (inputs, outputs: monte_carlo, impact_score, scenarios).
- **GET /companies/:id/simulations** — Response: list of past runs (id, created_at, impact_score summary).

## Portfolio

- **GET /portfolio** — Response: list of portfolio snapshot rows (current fund companies).
- **POST /portfolio/import** — Body: CSV file or JSON array matching PortfolioSnapshot columns. Response: count imported.
