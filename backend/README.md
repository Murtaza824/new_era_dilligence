# Jarvis Backend

Python FastAPI app for ingestion, RAG, memo generation, and simulations.

## Run

```bash
pip install -r requirements.txt
cp .env.example .env   # add OPENAI_API_KEY (and optionally ANTHROPIC_API_KEY)
uvicorn app.main:app --reload
```

API at http://localhost:8000. Docs at http://localhost:8000/docs.
