"""
Resolve company logo URL from a website URL.
Prefers: og:image, apple-touch-icon, link rel=icon, then favicon.ico.
"""
import logging
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


def resolve_logo_url(page_url: str) -> str | None:
    """
    Fetch the page at page_url and resolve the best logo URL.
    Returns an absolute URL or None if none found.
    """
    try:
        resp = httpx.get(page_url, follow_redirects=True, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        logger.warning("Logo resolution: failed to fetch %s: %s", page_url, e)
        return None

    base = resp.url
    base_origin = f"{base.scheme}://{base.netloc}"
    soup = BeautifulSoup(resp.text, "html.parser")

    # 1. og:image
    og = soup.find("meta", property="og:image")
    if og and og.get("content"):
        return _absolute(og["content"], base)

    # 2. apple-touch-icon (often high-res)
    ati = soup.find("link", rel="apple-touch-icon")
    if ati and ati.get("href"):
        return _absolute(ati["href"], base)
    ati_any = soup.find("link", rel="apple-touch-icon-precomposed")
    if ati_any and ati_any.get("href"):
        return _absolute(ati_any["href"], base)

    # 3. link rel="icon"
    icon = soup.find("link", rel="icon", href=True)
    if icon:
        return _absolute(icon["href"], base)
    # rel can be "shortcut icon" or "icon"
    for link in soup.find_all("link", rel=True):
        rel = (link.get("rel") or [])
        if isinstance(rel, str):
            rel = [rel]
        if "icon" in rel and link.get("href"):
            return _absolute(link["href"], base)

    # 4. Well-known favicon
    favicon_url = f"{base_origin}/favicon.ico"
    try:
        head = httpx.head(favicon_url, follow_redirects=True, timeout=5)
        if head.status_code == 200:
            return favicon_url
    except Exception:
        pass

    return None


def _absolute(href: str, base) -> str:
    """Make href absolute against base (response URL)."""
    if not href or href.startswith(("data:", "javascript:")):
        return ""
    return urljoin(str(base), href)
