"""Live worker clients, tested offline with recorded-style HTTP responses (httpx.MockTransport)."""

import asyncio
from datetime import date

import httpx
import pytest

from app.models.schemas import SourceType
from app.workers.court_records import CourtListenerRecords, CourtRecordsError
from app.workers.edgar import EdgarFilings, FilingsError
from app.workers.source_types import classify, registrable_domain
from app.workers.web_search import DuckDuckGoSearch, GPTResearcherSearch, TavilySearch, WebSearchError


def transport(handler):
    return httpx.MockTransport(handler)


# ── source classification ──────────────────────────────────────────
@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://www.courtlistener.com/docket/1/x/", SourceType.OFFICIAL_COURT),
        ("https://ecf.dcd.uscourts.gov/doc1/1", SourceType.OFFICIAL_COURT),
        ("https://www.sec.gov/news/press-release/2018-219", SourceType.REGULATORY),
        ("https://www.justice.gov/opa/pr/x", SourceType.REGULATORY),
        ("https://www.reuters.com/legal/x", SourceType.REPUTABLE_NEWS),
        ("https://news.bbc.co.uk/x", SourceType.REPUTABLE_NEWS),
        ("https://someblog.example.net/post", SourceType.SECONDARY),
        ("https://x.com/elonmusk/status/1", None),
        ("https://www.reddit.com/r/stocks/x", None),
        ("ftp://sec.gov/file", None),
        ("javascript:alert(1)//sec.gov", None),
        ("http://localhost:8000/api/health", None),
        ("http://127.0.0.1/x", None),
        ("http://192.168.1.5/admin", None),
        ("http://[::1]/x", None),
    ],
)
def test_classify(url, expected):
    assert classify(url) == expected


def test_company_domains_are_company_sources():
    assert classify("https://ir.tesla.com/press", company_domains=("tesla.com",)) == SourceType.COMPANY
    assert registrable_domain("https://news.bbc.co.uk/a") == "bbc.co.uk"


# ── CourtListener ──────────────────────────────────────────────────
CL_RESULT = {
    "caseName": "UNITED STATES OF AMERICA v. GOOGLE LLC",
    "docketNumber": "1:20-cv-03010",
    "court": "District Court, District of Columbia",
    "dateFiled": "2020-10-20",
    "dateTerminated": "2025-12-09",
    "docket_absolute_url": "/docket/18552824/united-states-of-america-v-google-llc/",
    "docket_id": 18552824,
}


def test_courtlistener_parses_dockets_and_sends_token():
    seen = {}

    def handler(request: httpx.Request):
        seen["auth"] = request.headers.get("Authorization")
        seen["q"] = request.url.params.get("q")
        return httpx.Response(200, json={"results": [CL_RESULT, {"caseName": None}]})

    sources = asyncio.run(CourtListenerRecords("tok", transport(handler)).search_dockets("Google antitrust", 5))
    assert seen == {"auth": "Token tok", "q": "Google antitrust"}
    assert len(sources) == 1
    s = sources[0]
    assert s.id == "cl_18552824" and s.source_type == SourceType.OFFICIAL_COURT
    assert s.url == "https://www.courtlistener.com/docket/18552824/united-states-of-america-v-google-llc/"
    assert s.published_date == date(2020, 10, 20) and "Terminated 2025-12-09" in s.snippet


@pytest.mark.parametrize(("status", "message"), [(403, "COURTLISTENER_API_TOKEN"), (429, "rate limit"), (500, "HTTP 500")])
def test_courtlistener_errors_are_explained(status, message):
    client = CourtListenerRecords("", transport(lambda r: httpx.Response(status)))
    with pytest.raises(CourtRecordsError, match=message):
        asyncio.run(client.search_dockets("x", 5))


# ── Tavily ─────────────────────────────────────────────────────────
def test_tavily_classifies_dedupes_and_drops_social_media():
    def handler(request: httpx.Request):
        assert request.headers["Authorization"] == "Bearer tvly-test"
        return httpx.Response(200, json={"results": [
            {"url": "https://www.reuters.com/a", "title": "Wire story", "content": "x" * 400, "published_date": "2026-10-02"},
            {"url": "https://www.reuters.com/a/", "title": "Same story", "content": "dup"},
            {"url": "https://x.com/someone/status/1", "title": "A post", "content": "not evidence"},
            {"url": "https://www.sec.gov/r", "title": "SEC release", "content": "short"},
        ]})

    sources = asyncio.run(TavilySearch("tvly-test", transport(handler)).search(["q"], 10))
    assert [s.source_type for s in sources] == [SourceType.REPUTABLE_NEWS, SourceType.REGULATORY]
    assert sources[0].published_date == date(2026, 10, 2) and len(sources[0].snippet) <= 220


def test_tavily_bad_key():
    with pytest.raises(WebSearchError, match="rejected"):
        asyncio.run(TavilySearch("bad", transport(lambda r: httpx.Response(401))).search(["q"], 5))


# ── DuckDuckGo and GPT Researcher (library stubs) ──────────────────
class StubDDGS:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def news(self, query, max_results):
        return [{"url": "https://apnews.com/a", "title": "AP story", "body": "b", "date": "2026-10-10T16:01:00+00:00"}]

    def text(self, query, max_results):
        return [{"href": "https://www.facebook.com/x", "title": "FB", "body": "b"}, {"href": "https://www.ftc.gov/x", "title": "FTC", "body": "b"}]


def test_duckduckgo_uses_news_and_text():
    sources = asyncio.run(DuckDuckGoSearch(StubDDGS).search(["q"], 10))
    assert [(s.source_type, s.published_date) for s in sources] == [
        (SourceType.REPUTABLE_NEWS, date(2026, 10, 10)),
        (SourceType.REGULATORY, None),
    ]


class StubResearcher:
    created: list[dict] = []

    def __init__(self, **kwargs):
        StubResearcher.created.append(kwargs)

    async def conduct_research(self):
        return None

    def get_research_sources(self):
        return [{"url": "https://www.courtlistener.com/docket/9/x/", "title": "Docket", "raw_content": "text"}]


def test_gpt_researcher_is_used_narrowly():
    sources = asyncio.run(GPTResearcherSearch(StubResearcher).search(["q1"], 5))
    kwargs = StubResearcher.created[-1]
    assert kwargs["report_source"] == "web" and kwargs["agent"] and kwargs["role"]  # role pre-supplied: no extra LLM call
    assert sources[0].source_type == SourceType.OFFICIAL_COURT


def test_gemini_block_replies_become_text():
    from app.workers.web_search import reply_text

    blocks = [{"type": "thinking", "thinking": "..."}, {"type": "text", "text": "a"}, "b", {"type": "text", "text": "c", "extras": {}}]
    assert reply_text(blocks) == "abc"
    assert reply_text("plain") == "plain"


# ── EDGAR ──────────────────────────────────────────────────────────
TICKERS = {"0": {"cik_str": 1318605, "ticker": "TSLA", "title": "Tesla, Inc."}}
SUBMISSIONS = {"filings": {"recent": {
    "form": ["8-K", "4", "10-Q", "8-K", "8-K"],
    "filingDate": ["2026-10-02", "2026-09-30", "2026-07-23", "2026-07-22", "2025-01-02"],
    "accessionNumber": ["0001628280-26-064366", "a", "0001628280-26-049999", "0001628280-26-049213", "old"],
    "primaryDocument": ["tsla-20261002.htm", "x.xml", "tsla-10q.htm", "tsla-20260722.htm", "old.htm"],
    "items": ["2.02,9.01", "", "", "2.02,9.01", "2.02"],
}}}


def test_edgar_lists_filings_in_period_and_results_events():
    def handler(request: httpx.Request):
        assert request.headers["User-Agent"] == "DeepSearch test you@example.edu"
        return httpx.Response(200, json=TICKERS if "company_tickers" in str(request.url) else SUBMISSIONS)

    edgar = EdgarFilings("DeepSearch test you@example.edu", transport(handler))
    sources, events = asyncio.run(edgar.recent("TSLA", date(2026, 4, 13), date(2026, 10, 12), 10))
    assert [s.published_date for s in sources] == [date(2026, 10, 2), date(2026, 7, 23), date(2026, 7, 22)]  # form 4 and old filing dropped
    assert sources[0].url == "https://www.sec.gov/Archives/edgar/data/1318605/000162828026064366/tsla-20261002.htm"
    assert "2.02 results of operations" in sources[0].title and sources[0].source_type == SourceType.COMPANY
    assert [e.id for e in events] == ["results_20261002", "results_20260722"]


def test_edgar_requires_a_user_agent():
    with pytest.raises(FilingsError, match="SEC_EDGAR_USER_AGENT"):
        EdgarFilings("")


def test_courtlistener_drops_procedural_and_duplicate_dockets():
    warrant = {**CL_RESULT, "docketNumber": "4:20-mj-01222", "docket_id": 1}
    misc = {**CL_RESULT, "docketNumber": "3:23-mc-80214", "docket_id": 2}
    duplicate = {**CL_RESULT, "docket_id": 3}
    client = CourtListenerRecords("", transport(lambda r: httpx.Response(200, json={"results": [warrant, CL_RESULT, misc, duplicate]})))
    sources = asyncio.run(client.search_dockets("x", 5))
    assert [s.id for s in sources] == ["cl_18552824"]


# ── wiring ─────────────────────────────────────────────────────────
GPT_RESEARCHER_VARS = ("RETRIEVER", "GOOGLE_API_KEY", "FAST_LLM", "SMART_LLM", "STRATEGIC_LLM", "EMBEDDING", "TAVILY_API_KEY")


def test_one_gemini_key_configures_gpt_researcher(monkeypatch):
    from app.config import Settings
    from app.runs import build_live_workers

    for name in GPT_RESEARCHER_VARS:
        monkeypatch.setenv(name, "")  # a blank line in .env counts as unset; monkeypatch restores them afterwards
    monkeypatch.setenv("SMART_LLM", "google_genai:my-choice")  # a value the user set is kept
    monkeypatch.setenv("LLM_PROVIDER", "gemini")  # ours; GPT Researcher would read it as its own deprecated setting
    live = build_live_workers(Settings(gemini_api_key="g-key", gemini_model="gemini-x", demo_mode_setting="false"))
    import os

    assert live.web.name == "GPT Researcher"
    assert os.environ["GOOGLE_API_KEY"] == "g-key"
    assert os.environ["FAST_LLM"] == "google_genai:gemini-x"
    assert os.environ["SMART_LLM"] == "google_genai:my-choice"
    assert os.environ["RETRIEVER"] == "duckduckgo"
    assert "LLM_PROVIDER" not in os.environ


def test_without_gemini_the_keyless_search_is_used(monkeypatch):
    from app.config import Settings
    from app.runs import build_live_workers

    live = build_live_workers(Settings())
    assert live.web.name == "DuckDuckGo" and live.filings is None and live.courts.name == "CourtListener"
    assert build_live_workers(Settings(tavily_api_key="t")).web.name == "Tavily"
