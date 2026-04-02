# Jarvis — Local Development Setup Guide

Everything a new engineer needs to clone, configure, and run the Jarvis diligence platform locally.

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Python** | 3.12+ | Match the Docker/production image (`python:3.12-slim`) |
| **Node.js** | 20 LTS or 22+ | Required by Next.js 15 |
| **npm** | 10+ | Ships with Node 20+ |
| **Git** | any recent | — |
| **Docker** (optional) | any recent | Only needed if you want local PostgreSQL instead of SQLite |

## Repository Structure

```
new_era_dilligence/
├── backend/          # Python FastAPI — APIs, RAG, memo/simulation agents
│   ├── app/          # Application code
│   │   ├── main.py       # Entry point (FastAPI app, startup hooks)
│   │   ├── database.py   # DB engine, session, migrations
│   │   ├── auth.py       # JWT auth helpers
│   │   ├── llm.py        # LLM abstraction (OpenAI / Anthropic)
│   │   ├── models/       # SQLAlchemy models
│   │   ├── routers/      # API route modules
│   │   ├── schemas/      # Pydantic request/response schemas
│   │   ├── services/     # Business logic (enrichment, matchmaking, gmail…)
│   │   └── agents/       # LLM-powered agents (memo, deal extractor, insight)
│   ├── scripts/          # Admin utilities (seed users, backups)
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   └── .env              # Your local secrets (gitignored)
├── frontend/         # Next.js 15 (App Router, Tailwind v4, shadcn/ui)
│   ├── src/
│   │   ├── app/          # Pages and layouts
│   │   ├── components/   # Reusable UI components
│   │   ├── lib/          # API client, utilities
│   │   ├── types/        # TypeScript interfaces
│   │   └── styles/       # Global CSS (Tailwind)
│   ├── package.json
│   └── .env.local        # Frontend env (gitignored)
├── docs/             # Architecture docs, API specs, deployment notes
├── docker-compose.yml    # Optional: local PostgreSQL
└── README.md
```

## Step 1 — Clone the Repo

```bash
git clone <repo-url> new_era_dilligence
cd new_era_dilligence
```

## Step 2 — Backend Setup

### 2a. Create a virtual environment

```bash
cd backend
python3.12 -m venv venv
source venv/bin/activate    # macOS / Linux
# venv\Scripts\activate     # Windows
```

### 2b. Install dependencies

```bash
pip install -r requirements.txt
```

> If you get an import error for `dotenv`, run `pip install python-dotenv` — it's used in `main.py` but may not be listed explicitly.

### 2c. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the required values:

| Variable | Required? | Description |
|----------|-----------|-------------|
| `OPENAI_API_KEY` | **Yes** | Powers LLM extraction, memo generation, RAG embeddings |
| `ANTHROPIC_API_KEY` | No | Alternative LLM provider (used if configured in `llm.py`) |
| `DATABASE_URL` | No | Defaults to `sqlite:///./jarvis.db` — see database section below |
| `JWT_SECRET` | **Yes** for multi-user | Secret for signing auth tokens. Any random string works locally |
| `CORS_ORIGINS` | No | Defaults to localhost origins in `.env.example` |
| `TAVILY_API_KEY` | No | Enables web search during auto-enrichment of dealflow entries |
| `GOOGLE_CLIENT_ID` | No | Gmail OAuth integration |
| `GOOGLE_CLIENT_SECRET` | No | Gmail OAuth integration |
| `GOOGLE_REDIRECT_URI` | No | Gmail OAuth callback URL |
| `COS_API_KEY` | No | Shared secret for Chief-of-Staff AI agent API |
| `ADMIN_INITIAL_PASSWORD` | No | Password for auto-seeded admin accounts (default: `ChangeMe123`) |
| `CHROMA_DATA_PATH` | No | Persistent path for ChromaDB vectors |
| `BACKUP_S3_BUCKET` | No | S3 bucket for database backups |
| `AWS_ACCESS_KEY_ID` | No | AWS credentials for backups |
| `AWS_SECRET_ACCESS_KEY` | No | AWS credentials for backups |

**Minimum viable `.env` for local dev:**

```
OPENAI_API_KEY=sk-...
DATABASE_URL=sqlite:///./jarvis.db
JWT_SECRET=local-dev-secret-change-me
CORS_ORIGINS=http://localhost:3000
```

### 2d. Choose a database

**Option A — SQLite (zero setup, recommended for getting started):**

Leave `DATABASE_URL=sqlite:///./jarvis.db` in `.env`. A `jarvis.db` file will be created automatically on first run.

**Option B — PostgreSQL (closer to production):**

```bash
# From the repo root:
docker compose up -d
```

This starts Postgres 16 on port 5432. Update your `.env`:

```
DATABASE_URL=postgresql://jarvis:jarvis@localhost:5432/jarvis
```

### 2e. Start the backend

```bash
uvicorn app.main:app --reload
```

On first startup the server will:
1. Create all database tables (`Base.metadata.create_all`)
2. Run schema migrations (column additions, data backfills)
3. Seed default locations (NYC, San Francisco, Boston, Los Angeles)
4. Seed two admin users if no users exist:
   - `murtaza@neweraventures.com`
   - `carter@neweraventures.com`
   - Password: value of `ADMIN_INITIAL_PASSWORD` or `ChangeMe123`

The API is now running at **http://localhost:8000**.

- Interactive docs: **http://localhost:8000/docs**
- Health check: `GET http://localhost:8000/health`

## Step 3 — Frontend Setup

### 3a. Install dependencies

```bash
cd frontend    # from repo root
npm install
```

### 3b. Configure environment

Create `.env.local`:

```bash
echo 'NEXT_PUBLIC_API_URL=http://localhost:8000' > .env.local
```

This is the only frontend env var. If omitted, it defaults to `http://localhost:8000`.

### 3c. Start the dev server

```bash
npm run dev
```

The frontend is now running at **http://localhost:3000**.

The top-right corner shows a **Backend: ok** indicator when the API is reachable.

## Step 4 — Log In

Open http://localhost:3000 and sign in with one of the seeded admin accounts:

| Email | Password |
|-------|----------|
| `murtaza@neweraventures.com` | `ChangeMe123` (or your `ADMIN_INITIAL_PASSWORD`) |
| `carter@neweraventures.com` | `ChangeMe123` (or your `ADMIN_INITIAL_PASSWORD`) |

## Common Tasks

### Run the seed script manually

If you need to re-seed admin users against a remote or fresh database:

```bash
cd backend
python -m scripts.seed_admin_users
```

### Lint and format frontend code

```bash
cd frontend
npm run lint       # ESLint with auto-fix
npm run format     # Prettier
```

### Reset the local database

Delete the SQLite file and restart the server:

```bash
rm backend/jarvis.db
cd backend && uvicorn app.main:app --reload
```

For Postgres, drop and recreate:

```bash
docker compose down -v
docker compose up -d
cd backend && uvicorn app.main:app --reload
```

## Architecture Overview

### Backend Stack

- **FastAPI** — REST API framework
- **SQLAlchemy 2.0** — ORM (models in `app/models/`)
- **Pydantic** — Request/response validation (schemas in `app/schemas/`)
- **ChromaDB** — Vector store for RAG (memo generation)
- **OpenAI / Anthropic** — LLM calls via `app/llm.py`
- **httpx + BeautifulSoup** — Web scraping for auto-enrichment
- **Tavily** — Optional web search for enrichment
- **boto3** — Optional S3 backups

### Frontend Stack

- **Next.js 15** (App Router, Turbopack dev)
- **React 19**
- **TypeScript**
- **Tailwind CSS v4** with `@tailwindcss/postcss`
- **shadcn/ui** components (Radix primitives)
- **Recharts** — Data visualization
- **Sonner** — Toast notifications

### Key API Modules

| Router | Prefix | Purpose |
|--------|--------|---------|
| `auth` | `/auth` | Login, register, JWT tokens |
| `companies` | `/companies` | Active Deals CRUD, status changes, portfolio promotion |
| `dealflow` | `/dealflow` | Pipeline entries, LLM extraction from notes, enrichment |
| `portfolio` | `/portfolio` | Portfolio company tracking |
| `documents` | `/documents` | File upload, extraction |
| `memos` | `/memos` | AI-generated investment memos |
| `simulations` | `/simulations` | Fund impact simulations |
| `touchpoints` | `/touchpoints` | Interaction tracking (calls, emails, meetings) |
| `network` | `/network` | Contact/LP network management |
| `integrations` | `/integrations` | Gmail OAuth, email sync |
| `cos_api` | `/api/v1` | External API for Chief-of-Staff agents |

### Data Flow

```
DealflowEntry (pipeline)
    ↕ bidirectional status sync
Company (active deals / portfolio)
    → PortfolioSnapshot (when invested)
    → Documents → Memos (AI-generated)
    → Simulations (fund impact modeling)
    → Touchpoints (interaction history)
```

## Deployment

| Component | Platform | Notes |
|-----------|----------|-------|
| Backend | Railway | Dockerfile in `backend/`, env vars in Railway dashboard |
| Frontend | Vercel | Auto-deploys from GitHub, set `NEXT_PUBLIC_API_URL` |
| Database | Railway (Postgres) | Provisioned alongside backend service |

See `docs/auth-and-deployment.md` for the full deployment checklist.

## Troubleshooting

**Backend won't start — `ModuleNotFoundError: No module named 'dotenv'`**
→ `pip install python-dotenv`

**Frontend build fails with ESLint errors**
→ `cd frontend && npm run lint` to auto-fix, then retry

**"Failed to delete company" errors**
→ This was fixed — the backend now cleans up all FK references before deletion. If you hit this on an old DB, pull latest code and restart.

**ChromaDB build fails in Docker (hnswlib)**
→ The Dockerfile sets `HNSWLIB_NO_NATIVE=1` to avoid needing build tools. If building locally, either set that env var or `pip install hnswlib` with a C compiler available.

**Can't connect to Postgres in Docker**
→ Check `docker compose ps` — the container should be running. Verify your `DATABASE_URL` matches the credentials in `docker-compose.yml`.
