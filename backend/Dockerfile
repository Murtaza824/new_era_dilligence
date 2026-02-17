# Jarvis backend — Railway / Docker
# Build context must be the backend directory (Railway: set Root Directory to "backend")
FROM python:3.12-slim

WORKDIR /app

# ChromaDB: avoid native build in slim image (often fails without build-essential)
ENV HNSWLIB_NO_NATIVE=1

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application
COPY app ./app
COPY scripts ./scripts

# Railway and many hosts expose PORT
ENV PORT=8000
EXPOSE 8000

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
