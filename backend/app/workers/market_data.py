"""Financial Data worker: daily price history (deterministic, no LLM).

yfinance is free and keyless but unofficial (D3), so every call is wrapped:
failures become MarketDataError and the run carries on without the data (D12).
"""

from __future__ import annotations

import math
from typing import Protocol

from app.models.schemas import FinancialDataPoint, Source, SourceType


class MarketDataError(RuntimeError):
    pass


class PriceSource(Protocol):
    name: str

    def history(self, ticker: str, period: str) -> list[FinancialDataPoint]: ...

    def source_for(self, ticker: str, points: list[FinancialDataPoint]) -> Source: ...


class YahooPriceSource:
    """Daily closes from Yahoo Finance via yfinance. Closes are split-adjusted."""

    name = "Yahoo Finance (yfinance)"

    def history(self, ticker: str, period: str) -> list[FinancialDataPoint]:
        import yfinance as yf  # imported lazily: slow to import, and tests never need it

        try:
            df = yf.Ticker(ticker).history(period=period, interval="1d", auto_adjust=False)
        except Exception as exc:
            raise MarketDataError(f"Yahoo Finance request failed for {ticker}: {type(exc).__name__}") from exc
        if df is None or df.empty or "Close" not in df:
            raise MarketDataError(f"No price data returned for {ticker} (unknown symbol or no network)")

        points: list[FinancialDataPoint] = []
        for ts, row in df.iterrows():
            close = float(row["Close"])
            if math.isnan(close):
                continue
            volume = row.get("Volume")
            points.append(
                FinancialDataPoint(
                    ticker=ticker,
                    date=ts.date(),
                    close=round(close, 4),
                    volume=None if volume is None or math.isnan(float(volume)) else int(volume),
                    split_adjusted=True,
                )
            )
        if len(points) < 2:
            raise MarketDataError(f"Too little price data for {ticker} to analyse")
        return points

    def source_for(self, ticker: str, points: list[FinancialDataPoint]) -> Source:
        return Source(
            title=f"{ticker} daily price history (Yahoo Finance)",
            url=f"https://finance.yahoo.com/quote/{ticker}/history",
            source_type=SourceType.SECONDARY,
            published_date=points[-1].date,
            retrieved_by="financial_data",
            snippet=f"{len(points)} daily closes from {points[0].date} to {points[-1].date}, split-adjusted.",
        )
