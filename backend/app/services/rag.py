"""
RAG pipeline — chunk text, embed with OpenAI, store/retrieve from ChromaDB.
Each company gets its own ChromaDB collection for isolation.
"""
import os
import logging
import chromadb
from chromadb.config import Settings

logger = logging.getLogger(__name__)

# Persistent ChromaDB storage. On Railway, set CHROMA_DATA_PATH to a volume path (e.g. /data/chroma).
CHROMA_DIR = os.getenv(
    "CHROMA_DATA_PATH",
    os.path.join(os.path.dirname(__file__), "..", "..", "chroma_data"),
)
_client: chromadb.ClientAPI | None = None


def _get_chroma_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        path = os.path.abspath(CHROMA_DIR)
        os.makedirs(path, exist_ok=True)
        _client = chromadb.PersistentClient(path=path)
    return _client


def _get_collection(company_id: str):
    """Get or create a ChromaDB collection for a company."""
    client = _get_chroma_client()
    name = f"company_{company_id.replace('-', '_')}"
    return client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"},
    )


# ── Chunking ──────────────────────────────────────────────────────────────


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """Split text into overlapping chunks by character count."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        if chunk.strip():
            chunks.append(chunk.strip())
        start += chunk_size - overlap
    return chunks


# ── Embedding ─────────────────────────────────────────────────────────────


def _embed(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts using OpenAI."""
    from openai import OpenAI

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is not set")
    client = OpenAI(api_key=api_key)
    resp = client.embeddings.create(model="text-embedding-3-small", input=texts)
    return [item.embedding for item in resp.data]


# ── Index ─────────────────────────────────────────────────────────────────


def index_document(company_id: str, document_id: str, text: str) -> int:
    """Chunk, embed, and store a document's text in ChromaDB. Returns chunk count."""
    collection = _get_collection(company_id)
    chunks = chunk_text(text)
    if not chunks:
        return 0

    # Batch embed (OpenAI supports up to 2048 in one call)
    batch_size = 100
    total = 0
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i : i + batch_size]
        embeddings = _embed(batch)
        ids = [f"{document_id}_chunk_{i + j}" for j in range(len(batch))]
        metadatas = [{"document_id": document_id, "chunk_index": i + j} for j in range(len(batch))]
        collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=batch,
            metadatas=metadatas,
        )
        total += len(batch)

    logger.info(f"Indexed {total} chunks for document {document_id} (company {company_id})")
    return total


# ── Retrieve ──────────────────────────────────────────────────────────────


def retrieve(company_id: str, query: str, top_k: int = 10) -> list[str]:
    """Retrieve the top-k most relevant chunks for a query."""
    collection = _get_collection(company_id)

    # Check if collection has any documents
    if collection.count() == 0:
        return []

    query_embedding = _embed([query])[0]
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, collection.count()),
    )
    documents = results.get("documents", [[]])[0]
    return documents


def delete_company_index(company_id: str):
    """Remove a company's entire vector collection."""
    client = _get_chroma_client()
    name = f"company_{company_id.replace('-', '_')}"
    try:
        client.delete_collection(name)
    except Exception:
        pass  # Collection may not exist
