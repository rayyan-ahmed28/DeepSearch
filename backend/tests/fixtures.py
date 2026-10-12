"""Offline stand-ins for external services, shared by the tests."""

from __future__ import annotations

from datetime import date, timedelta

from app.models.schemas import FinancialDataPoint, Source, SourceType
from app.workers.market_data import MarketDataError


class FixturePrices:
    """A fixed, deterministic price series for any ticker."""

    name = "fixture prices"

    def __init__(self, closes: list[float] | None = None) -> None:
        self.closes = closes or [100, 104, 101, 98, 103, 110, 107, 112, 115, 111]
        self.calls: list[tuple[str, str]] = []

    def history(self, ticker: str, period: str) -> list[FinancialDataPoint]:
        self.calls.append((ticker, period))
        start = date(2026, 1, 5)
        return [
            FinancialDataPoint(ticker=ticker, date=start + timedelta(days=i), close=c)
            for i, c in enumerate(self.closes)
        ]

    def source_for(self, ticker: str, points: list[FinancialDataPoint]) -> Source:
        return Source(
            title=f"{ticker} fixture prices",
            url="https://finance.yahoo.com/quote/TEST/history",
            source_type=SourceType.SECONDARY,
            retrieved_by="financial_data",
        )


class FailingPrices(FixturePrices):
    name = "always failing prices"

    def history(self, ticker: str, period: str) -> list[FinancialDataPoint]:
        self.calls.append((ticker, period))
        raise MarketDataError("simulated outage")


class FakeCourts:
    name = "fake court records"

    def __init__(self, sources: list[Source] | None = None, fail: bool = False) -> None:
        self.sources = sources if sources is not None else [
            Source(id="cl_1", title="EXAMPLE v. CORP (Test Court, No. 1:26-cv-00001)", url="https://www.courtlistener.com/docket/1/example-v-corp/",
                   source_type=SourceType.OFFICIAL_COURT, retrieved_by="legal_records", published_date=date(2026, 3, 2)),
        ]
        self.fail = fail
        self.queries: list[str] = []

    async def search_dockets(self, query: str, limit: int) -> list[Source]:
        self.queries.append(query)
        if self.fail:
            from app.workers.court_records import CourtRecordsError

            raise CourtRecordsError("simulated court outage")
        return self.sources[:limit]


class FakeWeb:
    name = "fake web search"

    def __init__(self, llm_calls_per_query: int = 0) -> None:
        self.llm_calls_per_query = llm_calls_per_query
        self.queries: list[list[str]] = []

    async def search(self, queries: list[str], limit: int, company_domains: tuple[str, ...] = ()) -> list[Source]:
        self.queries.append(queries)
        return [
            Source(id="web_1", title="Regulator press release", url="https://www.sec.gov/news/example", source_type=SourceType.REGULATORY, retrieved_by="web_research"),
            Source(id="web_2", title="Wire report", url="https://www.reuters.com/example", source_type=SourceType.REPUTABLE_NEWS, retrieved_by="web_research"),
        ][:limit]


class FakeFilings:
    name = "fake EDGAR"

    async def recent(self, ticker, start, end, limit):
        from app.models.llm_outputs import EventWindow

        mid = start + (end - start) / 2
        filing = Source(id="edgar_1", title=f"{ticker} Form 8-K filed {mid}", url="https://www.sec.gov/Archives/edgar/data/1/1/x.htm",
                        source_type=SourceType.COMPANY, retrieved_by="financial_data", published_date=mid)
        return [filing], [EventWindow(id=f"results_{mid:%Y%m%d}", date=mid, label=f"the results filing of {mid}")]


def offline_live():
    """LiveWorkers that never touch the network."""
    from app.graph.context import LiveWorkers

    return LiveWorkers(courts=FakeCourts(), web=FakeWeb(), filings=FakeFilings())
