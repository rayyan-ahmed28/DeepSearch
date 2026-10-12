"""Web Research worker (D2, D13).

Three back ends behind one interface, chosen by what is configured:
- GPT Researcher, used narrowly (conduct_research + get_research_sources),
  when Gemini is configured: it writes its own sub-queries (1 LLM call) and
  scrapes and compresses pages.
- Tavily (free credits) when TAVILY_API_KEY is set.
- DuckDuckGo, keyless, otherwise.
Every result is classified by domain (workers/source_types.py); social media
is dropped. Snippets are the search engine's short excerpt, capped.
"""

from __future__ import annotations

import asyncio
import hashlib
from datetime import date
from typing import Any, Protocol

import httpx

from app.models.schemas import Source
from app.workers.source_types import classify

SNIPPET_CHARS = 220


class WebSearchError(RuntimeError):
    pass


class WebSearch(Protocol):
    name: str
    llm_calls_per_query: int  # counted against the run's budget (D9)

    async def search(self, queries: list[str], limit: int, company_domains: tuple[str, ...] = ()) -> list[Source]: ...


def _parse_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def to_source(url: str, title: str, excerpt: str | None, published: Any, company_domains: tuple[str, ...]) -> Source | None:
    kind = classify(url, company_domains)
    if kind is None or not title:
        return None
    text = " ".join((excerpt or "").split())
    return Source(
        id="web_" + hashlib.sha1(url.encode()).hexdigest()[:10],
        title=title.strip()[:200],
        url=url,
        source_type=kind,
        published_date=_parse_date(published),
        retrieved_by="web_research",
        snippet=(text[: SNIPPET_CHARS - 1] + "…") if len(text) > SNIPPET_CHARS else (text or None),
    )


def dedupe(sources: list[Source], limit: int) -> list[Source]:
    seen: set[str] = set()
    out: list[Source] = []
    for s in sources:
        key = s.url.split("#")[0].rstrip("/")
        if key not in seen:
            seen.add(key)
            out.append(s)
    return out[:limit]


class TavilySearch:
    name = "Tavily"
    llm_calls_per_query = 0
    URL = "https://api.tavily.com/search"

    def __init__(self, api_key: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.api_key = api_key
        self.transport = transport

    async def search(self, queries: list[str], limit: int, company_domains: tuple[str, ...] = ()) -> list[Source]:
        found: list[Source] = []
        async with httpx.AsyncClient(transport=self.transport, timeout=25, headers={"Authorization": f"Bearer {self.api_key}"}) as client:
            for query in queries:
                for topic in ("news", "general"):
                    try:
                        response = await client.post(self.URL, json={"query": query, "topic": topic, "max_results": 5, "search_depth": "basic"})
                    except httpx.HTTPError as exc:
                        raise WebSearchError(f"Tavily unreachable ({type(exc).__name__})") from exc
                    if response.status_code in (401, 403):
                        raise WebSearchError("Tavily rejected the API key")
                    if response.status_code == 429 or response.status_code == 432:
                        raise WebSearchError("Tavily quota or rate limit reached")
                    if response.status_code != 200:
                        raise WebSearchError(f"Tavily returned HTTP {response.status_code}")
                    for r in response.json().get("results", []):
                        s = to_source(r.get("url", ""), r.get("title", ""), r.get("content"), r.get("published_date"), company_domains)
                        if s:
                            found.append(s)
        return dedupe(found, limit)


class DuckDuckGoSearch:
    """Keyless fallback (the ddgs package). Rate-limits heavy use; a free Tavily key is more reliable."""

    name = "DuckDuckGo"
    llm_calls_per_query = 0

    def __init__(self, ddgs_factory=None) -> None:
        self._factory = ddgs_factory

    def _search_sync(self, queries: list[str], company_domains: tuple[str, ...], limit: int) -> list[Source]:
        if self._factory is None:
            try:
                from ddgs import DDGS  # the maintained package
            except ImportError:  # older installs: the package's previous name
                from duckduckgo_search import DDGS

            factory = DDGS
        else:
            factory = self._factory
        found: list[Source] = []
        with factory() as ddgs:
            for query in queries:
                try:
                    for r in ddgs.news(query, max_results=6):
                        s = to_source(r.get("url", ""), r.get("title", ""), r.get("body"), r.get("date"), company_domains)
                        if s:
                            found.append(s)
                    if len(found) >= limit:
                        continue  # enough already: fewer requests, fewer rate limits
                    for r in ddgs.text(query, max_results=6):
                        s = to_source(r.get("href", ""), r.get("title", ""), r.get("body"), None, company_domains)
                        if s:
                            found.append(s)
                except Exception as exc:  # rate limits surface as generic exceptions in this library
                    if not found:
                        raise WebSearchError(f"DuckDuckGo search failed ({type(exc).__name__})") from exc
        return found

    async def search(self, queries: list[str], limit: int, company_domains: tuple[str, ...] = ()) -> list[Source]:
        return dedupe(await asyncio.to_thread(self._search_sync, queries, company_domains, limit), limit)


class GPTResearcherSearch:
    """GPT Researcher used narrowly (D13): one invocation per query, role pre-supplied."""

    name = "GPT Researcher"
    llm_calls_per_query = 1  # its sub-query generation; role selection is skipped by passing agent/role

    def __init__(self, researcher_cls=None) -> None:
        self._cls = researcher_cls

    async def search(self, queries: list[str], limit: int, company_domains: tuple[str, ...] = ()) -> list[Source]:
        cls = self._cls
        if cls is None:
            from gpt_researcher import GPTResearcher  # heavy import, only when Gemini is configured

            cls = GPTResearcher
        found: list[Source] = []
        for query in queries:
            researcher = cls(
                query=query,
                report_source="web",
                agent="Research Assistant",
                role="You find authoritative, dated sources: court records, regulators, company filings and established news.",
                verbose=False,
            )
            try:
                await researcher.conduct_research()
            except Exception as exc:
                raise WebSearchError(f"GPT Researcher failed ({type(exc).__name__})") from exc
            for r in researcher.get_research_sources() or []:
                s = to_source(r.get("url", ""), r.get("title", ""), r.get("raw_content") or r.get("content"), None, company_domains)
                if s:
                    found.append(s)
        return dedupe(found, limit)
