# Jarvis — New Era Ventures Diligence Platform

Monorepo for the Jarvis diligence platform: memo generation, fund impact simulations, and company library.

## Structure

- **backend/** — Python (FastAPI): APIs, ingestion, RAG, memo/simulation agents.
- **frontend/** — Next.js (Mainline template): company library, upload, memo and simulation views.

## Run locally

1. **Backend:** `cd backend && pip install -r requirements.txt && cp .env.example .env` (add your API keys to `.env`), then `uvicorn app.main:app --reload` (port 8000).
2. **Frontend:** `cd frontend && npm install && npm run dev` (port 3000).

Open http://localhost:3000; the app will show backend health from http://localhost:8000.
