"""Classify a web result into the source hierarchy by its domain (deterministic).

Official court and regulator domains come first; a short allowlist of
established outlets counts as reputable news; social media is rejected
outright (never authoritative legal evidence); everything else is secondary.
"""

from __future__ import annotations

import ipaddress
from urllib.parse import urlparse

from app.models.schemas import SourceType

COURT_DOMAINS = ("courtlistener.com", "uscourts.gov", "supremecourt.gov", "law.cornell.edu")
REPUTABLE_NEWS = {
    "reuters.com", "apnews.com", "bloomberg.com", "wsj.com", "nytimes.com", "ft.com", "washingtonpost.com",
    "cnbc.com", "bbc.com", "bbc.co.uk", "npr.org", "axios.com", "techcrunch.com", "fortune.com", "theverge.com",
    "economist.com", "forbes.com", "marketwatch.com", "barrons.com", "politico.com", "theguardian.com",
    "arstechnica.com", "electrek.co", "law360.com", "courthousenews.com",
}
REJECTED = {
    "twitter.com", "x.com", "facebook.com", "instagram.com", "tiktok.com", "reddit.com", "youtube.com",
    "linkedin.com", "quora.com", "medium.com", "pinterest.com",
}


def registrable_domain(url: str) -> str:
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    parts = host.split(".")
    if len(parts) >= 3 and parts[-2] in {"co", "com", "gov", "ac"} and len(parts[-1]) == 2:
        return ".".join(parts[-3:])  # bbc.co.uk
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


def _local(host: str) -> bool:
    """localhost or a private, loopback or link-local address: never a public source."""
    if host == "localhost" or host.endswith(".localhost") or host.endswith(".local"):
        return True
    try:
        ip = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved


def classify(url: str, company_domains: tuple[str, ...] = ()) -> SourceType | None:
    """The source type for a URL, or None if it must not be used as evidence."""
    host = (urlparse(url).hostname or "").lower()
    if not host or urlparse(url).scheme not in ("http", "https") or _local(host):
        return None
    domain = registrable_domain(url)
    if domain in REJECTED:
        return None
    if any(host == d or host.endswith("." + d) for d in COURT_DOMAINS):
        return SourceType.OFFICIAL_COURT
    if host.endswith(".gov") or host == "gov":
        return SourceType.REGULATORY
    if domain in company_domains:
        return SourceType.COMPANY
    if domain in REPUTABLE_NEWS:
        return SourceType.REPUTABLE_NEWS
    return SourceType.SECONDARY
