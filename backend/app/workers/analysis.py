"""Data Analysis worker: every figure in a report is computed here, in pandas.

Each result is a `Calculation` that records its method, so the report can
cite it by id ({{calc:<id>}}) and a viva examiner can see how it was made.
"""

from __future__ import annotations

import math

import pandas as pd

from app.models.schemas import Calculation, ChartSpec, FinancialDataPoint

TRADING_DAYS_PER_YEAR = 252


def analyse_prices(points: list[FinancialDataPoint]) -> tuple[list[Calculation], ChartSpec]:
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
    chart = ChartSpec(
        id="chart_price",
        type="line",
        title=f"{ticker} daily close, {start} to {end} (split-adjusted)",
        data=[{"date": d.isoformat(), "close": round(float(c), 2)} for d, c in close.items()],
    )
    return calculations, chart
