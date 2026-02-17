# Jarvis Implementation Plan

> **Jarvis — New Era Ventures Diligence Platform**
> Memo generation, fund impact simulations, and company library.

---

## Current State (as of Feb 2026)

### Backend (Python / FastAPI)
- Skeleton FastAPI app with `/health` endpoint
- LLM abstraction layer (`app/llm.py`) wrapping OpenAI (`gpt-4o-mini`)
- No database, no routers, no models, no services

### Frontend (Next.js 15 / Mainline template)
- Marketing site from Mainline template (Home, About, Contact, FAQ, Pricing, Login/Signup)
- `BackendHealth` component showing API status badge
- No Jarvis-specific routes or components (companies, memo, simulations)
- shadcn/ui component library available

### Docs
- `docs/api.md` — Full API contract (Companies, Memo, Simulations, Portfolio)
- `docs/schema.md` — Data schema for Phase 1 (6 tables)

---

## Phase 1 — Foundation: Database, Models & Company CRUD

**Goal:** Stand up the database, define all models, and build the company library with basic CRUD.

### Backend Tasks
1. **Add dependencies** — `sqlalchemy`, `alembic`, `aiosqlite` (or `databases`), `pydantic-settings`
2. **Database setup** — Create `app/database.py` with SQLAlchemy async engine, session factory, and `Base` declarative model
3. **Alembic init** — Configure migrations (`alembic/`)
4. **Define models** (`app/models/`)
   - `company.py` — Companies table
   - `document.py` — Documents table
   - `memo.py` — Memos + MemoRevisions tables
   - `portfolio.py` — PortfolioSnapshot table
   - `simulation.py` — SimulationRuns table
5. **Pydantic schemas** (`app/schemas/`)
   - Request/response schemas matching `docs/api.md`
6. **Company router** (`app/routers/companies.py`)
   - `POST /companies` — Create company
   - `GET /companies` — List all companies
   - `GET /companies/:id` — Get company detail (with docs, latest memo, latest sim)
7. **Register router** in `app/main.py`, add DB session dependency
8. **Run initial migration**, verify CRUD works via Swagger UI

### Frontend Tasks
9. **API client** — Create `src/lib/api.ts` with typed fetch helpers pointing at `NEXT_PUBLIC_API_URL`
10. **TypeScript types** — Create `src/types/index.ts` matching backend schemas (Company, Document, Memo, Simulation, etc.)
11. **Company Library page** (`src/app/companies/page.tsx`)
    - List all companies in a card grid or table
    - "Add Company" button → modal or inline form
12. **Company Detail page** (`src/app/companies/[id]/page.tsx`)
    - Header with company name + metadata
    - Tabs or sections: Documents, Memo, Simulations
    - Placeholder content for Memo and Simulations tabs
13. **Navigation update** — Add "Companies" link to navbar; optionally hide marketing pages or gate behind auth

### Definition of Done
- Can create a company, see it in the library, click into its detail page
- Database persists across restarts (SQLite file)
- All API endpoints return proper JSON matching the contract

---

## Phase 2 — Document Ingestion & Text Extraction

**Goal:** Upload pitch decks (PDF), paste call notes, or provide website URLs; extract and store text.

### Backend Tasks
1. **Add dependencies** — `python-multipart` (already present), `pypdf2` or `pdfplumber`, `httpx` (for URL fetching), `beautifulsoup4`
2. **File storage** — Create `uploads/` directory; save uploaded PDFs to disk, store path in `Documents.storage_path`
3. **Text extraction service** (`app/services/extraction.py`)
   - `extract_pdf(file_path) → str` — Extract text from PDF
   - `extract_website(url) → str` — Fetch URL, strip HTML, return clean text
   - `extract_call_notes(content) → str` — Pass-through (already text)
4. **Document router** (`app/routers/documents.py` or extend companies router)
   - `POST /companies/:id/documents` — Accept multipart file (deck) or JSON (call_notes/website)
   - On upload: save file, run extraction, store `extracted_text` in DB
   - Return document object with status
5. **Background processing (optional)** — If extraction is slow, return `status: "processing"` and run extraction async (use FastAPI `BackgroundTasks`)

### Frontend Tasks
6. **Upload panel** on Company Detail page → Documents tab
   - Drag-and-drop file upload for pitch decks (PDF)
   - Text area for pasting call notes
   - URL input for website links
7. **Document list** — Show all uploaded documents for the company with type badges and timestamps
8. **Status indicators** — Show extraction status (processing / ready / error)

### Definition of Done
- Can upload a PDF, paste notes, or add a URL for a company
- Text is extracted and stored in the database
- Documents appear in the company detail view

---

## Phase 3 — Memo Generation (RAG + Section Agents)

**Goal:** Generate investment memos from uploaded documents using section-specific LLM agents orchestrated into a cohesive memo.

### Backend Tasks
1. **Add dependencies** — `tiktoken`, `chromadb` (or `faiss-cpu`) for vector store, optionally `langchain` or keep it lightweight
2. **RAG pipeline** (`app/services/rag.py`)
   - Chunk extracted text (by section / fixed-size with overlap)
   - Embed chunks using OpenAI `text-embedding-3-small`
   - Store in ChromaDB (per-company collection)
   - `retrieve(company_id, query, top_k) → list[str]` — Retrieve relevant chunks
3. **Memo section agents** (`app/agents/memo_sections.py`)
   - Define memo template sections (e.g., Company Overview, Market Opportunity, Product & Technology, Team, Business Model, Traction, Risks, Investment Thesis)
   - Each section agent: retrieve relevant context → LLM prompt → section draft
4. **Memo orchestrator** (`app/agents/memo_orchestrator.py`)
   - Run all section agents (parallel or sequential)
   - Combine into a single cohesive memo
   - Apply consistency pass (optional: one final LLM call to smooth transitions)
5. **Memo router** (`app/routers/memos.py`)
   - `POST /companies/:id/memo/generate` — Trigger full generation; return memo object
   - `GET /companies/:id/memo` — Get latest memo
   - `POST /companies/:id/memo/revise` — Re-run with updated docs; increment version
   - `GET /companies/:id/memo/export?format=pdf` — Export as PDF (use `weasyprint` or `reportlab`)
6. **Memo model updates** — Store memo content as structured JSON (sections array) + rendered Markdown
7. **Upgrade LLM layer** — Update `app/llm.py` to support `gpt-4o` for memo generation (higher quality), keep `gpt-4o-mini` for lighter tasks

### Frontend Tasks
8. **Memo tab** on Company Detail page
   - "Generate Memo" button (disabled until documents exist)
   - Loading state with progress indication (section-by-section if streaming)
   - Rendered memo in Markdown with collapsible sections
   - "Regenerate" and "Revise" buttons
9. **Memo export** — "Export PDF" button that triggers download
10. **Memo versioning** — Show version number, allow viewing previous versions

### Definition of Done
- Can generate a memo from uploaded documents
- Memo has clearly defined sections with relevant content
- Can regenerate/revise when new documents are added
- Can export memo as PDF

---

## Phase 4 — Fund Impact Simulations

**Goal:** Run Monte Carlo simulations to model potential fund impact of an investment, using portfolio context.

### Backend Tasks
1. **Add dependencies** — `numpy`, `scipy` (for distributions)
2. **Portfolio router** (`app/routers/portfolio.py`)
   - `GET /portfolio` — List all portfolio snapshots
   - `POST /portfolio/import` — Import CSV or JSON of current portfolio
3. **Simulation engine** (`app/services/simulation.py`)
   - Inputs: entry valuation, ownership %, check size, fund size, scenarios
   - Monte Carlo: sample exit valuations from distribution (log-normal or custom), compute returns, MOIC, fund impact
   - Scenario analysis: bear / base / bull cases with probabilities
   - Impact score: probability-weighted expected return as % of fund
   - Output: `{ monte_carlo: { percentiles, distribution }, impact_score, scenarios: [...] }`
4. **Simulation planner agent** (`app/agents/simulation_planner.py`)
   - LLM reads memo + market data → suggests reasonable simulation inputs
   - Proposes bear/base/bull exit valuations with rationale
5. **Simulation router** (`app/routers/simulations.py`)
   - `POST /companies/:id/simulate` — Run simulation with optional overrides
   - `GET /companies/:id/simulations` — List past simulation runs
6. **Store results** — Save inputs + outputs as JSON in SimulationRuns table

### Frontend Tasks
7. **Portfolio page** (`src/app/portfolio/page.tsx`)
   - Table view of current portfolio (imported from CSV)
   - Import button with file upload
8. **Simulation tab** on Company Detail page
   - Input form: entry valuation, ownership %, check size (pre-filled from AI suggestions)
   - "Run Simulation" button
   - Results display:
     - Monte Carlo distribution chart (histogram or density plot) — use `recharts` or `chart.js`
     - Scenario table (bear / base / bull with probabilities and returns)
     - Fund impact score (prominent metric)
   - History of past simulation runs
9. **Charts library** — Add `recharts` for data visualization

### Definition of Done
- Can import portfolio CSV
- Can run simulations with custom or AI-suggested inputs
- Results show Monte Carlo distribution, scenario analysis, and fund impact score
- Past runs are saved and viewable

---

## Phase 5 — Polish, Auth & UX

**Goal:** Tighten the UX, add authentication, error handling, and production readiness.

### Backend Tasks
1. **Error handling** — Global exception handlers, consistent error response format
2. **Input validation** — Pydantic validators on all request schemas
3. **Logging** — Structured logging with `structlog` or `loguru`
4. **Auth (if needed)** — Simple API key auth or JWT (depends on deployment context)
5. **Rate limiting** — Protect LLM endpoints from excessive calls
6. **Tests** — `pytest` + `httpx` for API tests; mock LLM calls

### Frontend Tasks
7. **Loading & error states** — Consistent skeleton loaders, error boundaries, toast notifications
8. **Responsive design** — Ensure all Jarvis pages work on tablet/mobile
9. **Auth integration** — Login/signup wired to backend (if auth is added)
10. **Navigation polish** — Sidebar or top-nav with Companies, Portfolio, Settings
11. **Dark mode** — Ensure all custom components respect theme toggle (already in template)

### Definition of Done
- App handles errors gracefully with user-friendly messages
- Core flows work on desktop and tablet
- Backend has test coverage for critical paths

---

## Phase 6 — Deployment & Infrastructure

**Goal:** Deploy the platform for team use.

### Tasks
1. **Backend deployment** — Dockerize FastAPI app; deploy to Railway / Render / Fly.io
2. **Frontend deployment** — Deploy Next.js to Vercel
3. **Database migration** — Move from SQLite to PostgreSQL for production (update `DATABASE_URL`)
4. **Environment config** — Separate `.env` files for dev / staging / prod
5. **CI/CD** — GitHub Actions for lint, test, deploy on push to `main`
6. **Monitoring** — Basic health checks + error alerting (Sentry or similar)

---

## Implementation Order & Dependencies

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4
  │                                     │
  └──────────────────────────────────────┴──→ Phase 5 ──→ Phase 6
```

- **Phase 1** is the foundation — everything depends on it
- **Phase 2** requires Phase 1 (documents belong to companies)
- **Phase 3** requires Phase 2 (memos are generated from documents)
- **Phase 4** can start in parallel with Phase 3 (simulations are independent of memos) but benefits from memo content for the AI planner
- **Phase 5** runs alongside or after feature phases
- **Phase 6** comes last

---

## Estimated Effort

| Phase | Scope | Estimate |
|-------|-------|----------|
| Phase 1 | DB + Company CRUD + Library UI | 1–2 sessions |
| Phase 2 | Document upload + extraction | 1–2 sessions |
| Phase 3 | RAG + memo agents + memo UI | 2–3 sessions |
| Phase 4 | Simulations + portfolio + charts | 2–3 sessions |
| Phase 5 | Polish, auth, tests | 1–2 sessions |
| Phase 6 | Deploy | 1 session |

**Total: ~8–13 working sessions**

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Backend framework | FastAPI (Python) |
| Database | SQLite (dev) → PostgreSQL (prod) |
| ORM | SQLAlchemy (async) |
| Migrations | Alembic |
| LLM | OpenAI GPT-4o / GPT-4o-mini |
| Embeddings | OpenAI text-embedding-3-small |
| Vector store | ChromaDB |
| Frontend framework | Next.js 15 (App Router) |
| UI components | shadcn/ui + Tailwind CSS v4 |
| Charts | Recharts |
| Deployment | Vercel (frontend) + Railway/Render (backend) |
