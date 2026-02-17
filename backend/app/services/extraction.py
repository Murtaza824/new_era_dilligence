"""
Text extraction service for different document types.
- PDF decks → pypdf
- Websites → httpx + BeautifulSoup
- Call notes → pass-through
"""
import logging

logger = logging.getLogger(__name__)


def extract_pdf(file_path: str) -> str:
    """Extract text from a PDF file."""
    from pypdf import PdfReader

    reader = PdfReader(file_path)
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text.strip())
    return "\n\n".join(pages)


def extract_website(url: str) -> str:
    """Fetch a URL and extract clean text from the HTML."""
    import httpx
    from bs4 import BeautifulSoup

    resp = httpx.get(url, follow_redirects=True, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    # Remove script/style elements
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    text = soup.get_text(separator="\n", strip=True)
    # Collapse multiple blank lines
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return "\n".join(lines)


def extract_call_notes(content: str) -> str:
    """Call notes are already text — just clean up whitespace."""
    return content.strip()


def extract_document(doc_type: str, file_path: str | None = None,
                     content: str | None = None, url: str | None = None) -> str:
    """Route to the right extractor based on document type."""
    try:
        if doc_type == "deck" and file_path:
            return extract_pdf(file_path)
        elif doc_type == "website" and url:
            return extract_website(url)
        elif doc_type == "call_notes" and content:
            return extract_call_notes(content)
        elif content:
            return extract_call_notes(content)
        else:
            raise ValueError(f"Cannot extract: type={doc_type}, no content/file/url provided")
    except Exception as e:
        logger.error(f"Extraction failed for {doc_type}: {e}")
        raise
