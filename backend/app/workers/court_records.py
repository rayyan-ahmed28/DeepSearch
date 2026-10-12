"""Legal Records worker: federal court dockets from CourtListener (API v4, D4).

Works without a token at a low rate limit; COURTLISTENER_API_TOKEN raises it.
If nothing matches, the worker says "no primary court record found" rather
than inventing a case.
"""

from __future__ import annotations

import hashlib
import re
from datetime import date
from typing import Protocol

import httpx

from app.models.schemas import Source, SourceType

SEARCH_URL = "https://www.courtlistener.com/api/rest/v4/search/"
SITE = "https://www.courtlistener.com"
# Magistrate, search-warrant and miscellaneous dockets (e.g. 4:20-mj-01222) are procedural records,
# not the cases people ask about; they would otherwise crowd out the real civil/criminal cases.
PROCEDURAL_DOCKET = re.compile(r"-(mj|sw|mc|cm|gj|po|pt|ml)-", re.IGNORECASE)


class CourtRecordsError(RuntimeError):
    pass


class CourtRecords(Protocol):
    name: str

    async def search_dockets(self, query: str, limit: int) -> list[Source]: ...


def _parse_date(value: str | None) -> date | None:
    try:
        return date.fromisoformat(value[:10]) if value else None
    except ValueError:
        return None


def docket_to_source(result: dict) -> Source | None:
    path = result.get("docket_absolute_url")
    if not path or not result.get("caseName"):
        return None
    filed = _parse_date(result.get("dateFiled"))
    terminated = _parse_date(result.get("dateTerminated"))
    number = result.get("docketNumber") or "no docket number"
    court = result.get("court") or result.get("court_id") or "court unknown"
    snippet = f"{court}, No. {number}. Filed {filed or 'date unknown'}."
    if terminated:
        snippet += f" Terminated {terminated}."
    return Source(
        id=f"cl_{result.get('docket_id') or hashlib.sha1(path.encode()).hexdigest()[:10]}",
        title=f"{result['caseName']} ({court}, No. {number})",
        url=SITE + path,
        source_type=SourceType.OFFICIAL_COURT,
        published_date=filed,
        retrieved_by="legal_records",
        snippet=snippet,
    )


class CourtListenerRecords:
    name = "CourtListener"

    def __init__(self, token: str = "", transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.token = token
        self.transport = transport

    async def search_dockets(self, query: str, limit: int) -> list[Source]:
        headers = {"Authorization": f"Token {self.token}"} if self.token else {}
        try:
            async with httpx.AsyncClient(transport=self.transport, timeout=20, headers=headers) as client:
                response = await client.get(SEARCH_URL, params={"q": query, "type": "r", "order_by": "score desc"})
        except httpx.HTTPError as exc:
            raise CourtRecordsError(f"CourtListener unreachable ({type(exc).__name__})") from exc
        if response.status_code in (401, 403):
            raise CourtRecordsError("CourtListener refused the request; set COURTLISTENER_API_TOKEN (free)")
        if response.status_code == 429:
            raise CourtRecordsError("CourtListener rate limit reached; a free API token raises it")
        if response.status_code != 200:
            raise CourtRecordsError(f"CourtListener returned HTTP {response.status_code}")
        sources: list[Source] = []
        seen: set[tuple[str, str]] = set()
        for result in response.json().get("results") or []:
            key = (result.get("court_id") or "", result.get("docketNumber") or "")
            if PROCEDURAL_DOCKET.search(key[1]) or key in seen:
                continue
            seen.add(key)
            source = docket_to_source(result)
            if source:
                sources.append(source)
        return sources[:limit]
