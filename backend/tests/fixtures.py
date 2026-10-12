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
