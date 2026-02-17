# Auth, Database & Deployment Runbook

Single source of truth for authentication, production database, and going live on Railway. Use this to implement and deploy in order.

---

## 1. Authentication

### Approach

Keep v1 minimal: an **allowlist of admin emails** with **email + password + JWT** so the two admins can log in via the frontend (e.g. the template’s Login/Signup). Optional later: magic-link or API-key for server-to-server.

### Admin users (v1)

These are the only two users with admin access:

- `murtaza@neweraventures.com`
- `carter@neweraventures.com`

### Scope

**Backend**

- `User` model: `id`, `email`, `role`, `password_hash`, `created_at`.
- JWT: issue on login, verify on protected routes.
- Dependency (e.g. `get_current_user`) that resolves the user from the token and returns 401 if missing or not admin.

**Frontend**

- Login form POSTs credentials to the backend; backend returns a JWT.
- Store the token (e.g. httpOnly cookie or localStorage).
- API client sends `Authorization: Bearer <token>` on all requests to Jarvis APIs.
- Protect Jarvis routes (Companies, Portfolio, etc.) so only authenticated admins can access; redirect unauthenticated users to login.

### Where to implement

| Layer   | Files / areas |
|--------|----------------|
| Backend | `app/models/user.py`, `app/schemas/auth.py`, `app/routers/auth.py`, `app/auth.py` (JWT helpers + `get_current_user`). |
| Frontend | Auth context, login page wired to backend, API client attaching `Authorization: Bearer <token>`, route guard on `/companies`, `/portfolio`, etc. |
| Data   | Seed or one-off script (e.g. `scripts/seed_admin_users.py`) that creates the two users with hashed passwords and `admin` role. |

---

## 2. Database

### Current state

- [backend/app/database.py](backend/app/database.py) uses `DATABASE_URL` (default `sqlite:///./jarvis.db`), sync SQLAlchemy, and `Base.metadata.create_all(bind=engine)` at startup.
- SQLite-only logic: `_migrate_portfolio_factors()` uses `PRAGMA table_info(...)`; it already runs only when `"sqlite" in DATABASE_URL`.

### Local PostgreSQL (optional)

To use Postgres locally instead of SQLite:

1. Start Postgres (e.g. via Docker): from the repo root run `docker compose up -d`.
2. In `backend/.env` set:
   ```bash
   DATABASE_URL=postgresql://jarvis:jarvis@localhost:5432/jarvis
   ```
3. Start the backend so tables are created: `cd backend && uvicorn app.main:app --reload` (then stop it if you like).
4. Seed the two admin users: `cd backend && python -m scripts.seed_admin_users`.
5. Run the backend again and use the app. The `docker-compose.yml` in the repo root defines the `jarvis` user, password, and database.

### Production: PostgreSQL

Use **PostgreSQL** in production.

1. In Railway: create a new project (or use existing), then add the **Postgres** plugin.
2. Railway provides a connection URL. Copy it (e.g. `postgresql://postgres:...@...railway.app:5432/railway`).
3. In the backend service’s environment, set `DATABASE_URL` to this value (Railway can reference the Postgres service’s `DATABASE_URL` variable so it stays in sync).

### Compatibility

- `create_all` works with PostgreSQL; no change needed for the first deploy.
- Keep the guard in `_migrate_portfolio_factors()` so it only runs when `"sqlite" in DATABASE_URL` (already in place).
- **Optional:** Add Alembic and an initial migration for production schema changes later; for v1, `create_all` is sufficient.

### Seeding admin users

- Use a one-off script (e.g. `scripts/seed_admin_users.py`) or a migration that inserts the two users with hashed passwords and role `admin`.
- Exact emails for v1: `murtaza@neweraventures.com`, `carter@neweraventures.com`. These are the only admins initially.
- Run the seed after the first deploy (or as part of deploy) so the table exists and both users can log in.

---

## 3. Railway deployment

### Backend

The repo includes [backend/Dockerfile](backend/Dockerfile) and CORS is driven by the `CORS_ORIGINS` env var (comma-separated list of allowed frontend origins).

**Step-by-step: Deploy backend to Railway**

1. **Create a project** — [railway.app](https://railway.app) → New Project.
2. **Add Postgres** — In the project, click “New” → “Database” → “PostgreSQL”. Wait for it to provision. Open the Postgres service → “Variables” (or “Connect”) and copy `DATABASE_URL`.
3. **Add backend service** — “New” → “GitHub Repo” (or “Empty Service” and connect repo). Select this repo.
4. **Configure the service** — In the backend service:
   - **Settings** → “Root Directory” (or “Source”) → set to `backend` so the build context is the backend folder.
   - **Settings** → “Build” → Railway should detect the Dockerfile in `backend/` and use it. If not, set “Dockerfile Path” to `Dockerfile` (relative to root directory).
   - **Variables** → Add:
     - `DATABASE_URL` — paste the Postgres URL from step 2 (or use Railway’s variable reference to the Postgres service).
     - `OPENAI_API_KEY` — your OpenAI key.
     - `JWT_SECRET` — a long random string (e.g. `openssl rand -hex 32`).
     - `CORS_ORIGINS` — your frontend URL(s), e.g. `https://your-app.vercel.app` or `https://your-frontend.up.railway.app`. For multiple: `https://app1.com,https://app2.com`.
   - **Settings** → “Deploy” → trigger a deploy. Health check: path `/health` if Railway asks.
5. **Seed admin users** — After the first successful deploy, run the seed script once against the production DB. From your machine (with `DATABASE_URL` set to the Railway Postgres URL) or via Railway’s “Run Command” / one-off job: `cd backend && python -m scripts.seed_admin_users`. Use the same `DATABASE_URL` and set `ADMIN_INITIAL_PASSWORD` if desired.
6. **Note the backend URL** — In the backend service, open “Settings” → “Networking” / “Public Networking” and generate a domain (e.g. `your-backend.up.railway.app`). Use this as `NEXT_PUBLIC_API_URL` in the frontend.

**Health**

- Use the existing `GET /health` endpoint for Railway’s health check. Configure the health check path to `/health` if the dashboard allows it.

### Frontend

**Option A (recommended)**

- Deploy Next.js to **Vercel** (or Netlify). Connect the repo, set the root to `frontend` if needed.
- Set `NEXT_PUBLIC_API_URL` to the Railway backend’s public URL (e.g. `https://<backend-service>.up.railway.app`).
- Easiest and aligns with [docs/implementation-plan.md](docs/implementation-plan.md) Phase 6.

**Option B**

- Deploy the frontend on **Railway** as a second service: build with `npm run build`, start with `npm run start` (or the Node server you use).
- Set `NEXT_PUBLIC_API_URL` to the backend’s public URL.

### Environment checklist

| Variable | Where | Required in prod | Notes |
|----------|--------|-------------------|--------|
| `DATABASE_URL` | Backend | Yes | From Railway Postgres (e.g. `postgresql://...`) |
| `OPENAI_API_KEY` | Backend | Yes | For RAG and LLM |
| `JWT_SECRET` | Backend | Yes | Secret for signing/verifying JWTs; generate a long random string |
| `ANTHROPIC_API_KEY` | Backend | No | Optional if you add Anthropic later |
| `NEXT_PUBLIC_API_URL` | Frontend | Yes | Backend base URL (e.g. `https://<backend>.up.railway.app`) |

Add any extra auth or app-specific variables your implementation uses.

---

## 4. Implementation order

Follow this sequence to build and deploy:

1. **Add this runbook** — Ensure [docs/auth-and-deployment.md](docs/auth-and-deployment.md) is in place (you’re here).
2. **Implement auth** — Backend: User model, JWT issue/verify, auth router (e.g. login), `get_current_user` dependency; seed the two admins. Frontend: login form, token storage, API client sending `Authorization: Bearer <token>`, route protection for `/companies`, `/portfolio`, etc.
3. **Postgres and local check** — Provision Postgres on Railway and set `DATABASE_URL`. Run the backend locally against this `DATABASE_URL` once: create tables (`create_all`), run seed so both admin users exist. Fix any remaining SQLite-only code paths if needed.
4. **Deploy backend to Railway** — Dockerize (or Nixpacks), deploy, set env vars, configure CORS and health check.
5. **Deploy frontend** — Deploy to Vercel or Railway; set `NEXT_PUBLIC_API_URL`; verify login and API calls end-to-end.

**Later:** Add CI/CD (e.g. GitHub Actions for lint, test, deploy on push to `main`). Optional: monitoring (e.g. Sentry) for errors.

---

## Out of scope for v1

- Password reset or invite flows (v1 = two fixed admins only).
- Full CI/CD and monitoring are noted above as follow-ups.
