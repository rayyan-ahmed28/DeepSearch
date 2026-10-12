"""Data Analysis worker: every figure in a report is computed here, in pandas.

Each result is a `Calculation` that records its method, so the report can
cite it by id ({{calc:<id>}}) and a viva examiner can see how it was made.
"""

from __future__ import annotations

import math
from collections.abc import Iterable

import pandas as pd

from app.models.llm_outputs import EventWindow
from app.models.schemas import Calculation, ChartSpec, FinancialDataPoint

TRADING_DAYS_PER_YEAR = 252


def event_window_return(close: pd.Series, event: EventWindow, ticker: str) -> Calculation | None:
    """Close on the last trading day before the event -> close on the first trading day after it.

    Using the days either side means news released after the close (or on a
    weekend) is still captured. Returns None if the event is outside the data.
    """
    before = close[close.index < event.date]
    after = close[close.index > event.date]
    if before.empty or after.empty:
        return None
    start_day, end_day = before.index[-1], after.index[0]
    change = (after.iloc[0] / before.iloc[-1] - 1) * 100
    return Calculation(
        id=f"ret_{event.id}",
        description=f"{ticker} return across {event.label} ({start_day} close to {end_day} close)",
        result=round(float(change), 2),
        method="pandas: close on first trading day after the event / close on last trading day before - 1",
        unit="%",
    )


def analyse_prices(
    points: list[FinancialDataPoint], events: Iterable[EventWindow] = ()
) -> tuple[list[Calculation], ChartSpec]:
    if len(points) < 2:
        raise ValueError("Need at least two prices to analyse")
    ticker = points[0].ticker
    close = pd.Series([p.close for p in points], index=[p.date for p in points], dtype="float64")
    start, end = close.index[0], close.index[-1]

    period_return = (close.iloc[-1] / close.iloc[0] - 1) * 100
    daily = close.pct_change().dropna()
    volatility = float(daily.std() * math.sqrt(TRADING_DAYS_PER_YEAR) * 100) if len(daily) > 1 else 0.0
    drawdown = float(((close / close.cummax()) - 1).min() * 100)

    calculations = [
        Calculation(
            id="ret_period",
            description=f"{ticker} return from {start} to {end}",
            result=round(float(period_return), 2),
            method="pandas: last close / first close - 1",
            unit="%",
        ),
        Calculation(
            id="vol_annual",
            description=f"{ticker} annualised volatility of daily returns",
            result=round(volatility, 2),
            method="pandas: close.pct_change().std() * sqrt(252)",
            unit="%",
        ),
        Calculation(
            id="dd_max",
            description=f"{ticker} maximum drawdown",
            result=round(drawdown, 2),
            method="pandas: min(close / close.cummax() - 1)",
            unit="%",
        ),
    ]
    for event in events:
        calc = event_window_return(close, event, ticker)
        if calc is not None:
            calculations.append(calc)

    chart = ChartSpec(
        id="chart_price",
        type="line",
        title=f"{ticker} daily close, {start} to {end} (split-adjusted)",
        data=[{"date": d.isoformat(), "close": round(float(c), 2)} for d, c in close.items()],
    )
    return calculations, chart
