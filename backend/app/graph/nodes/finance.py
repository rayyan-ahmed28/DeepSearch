"""Finance side of the slice: Finance Manager (LLM plan) and two deterministic workers."""

from __future__ import annotations

import asyncio
import re

from langchain_core.runnables import RunnableConfig

from app.graph.context import get_ctx
from app.models.llm_outputs import FinancePlan
from app.models.schemas import ResearchState, Task, TaskStatus
from app.providers import prompts
from app.workers.analysis import analyse_prices
from app.workers.market_data import MarketDataError

PERIOD_BY_DEPTH = {"quick": "3mo", "standard": "6mo", "deep": "1y"}
TICKER_SHAPE = re.compile(r"^[A-Z][A-Z0-9]{0,5}(?:[.-][A-Z0-9]{1,2})?$")
FETCH_ATTEMPTS = 2  # D12: bounded retries, then carry on without the data


def _clean_ticker(raw: str | None) -> str | None:
    if not raw:
        return None
    ticker = raw.strip().lstrip("$").upper()
    return ticker if TICKER_SHAPE.match(ticker) else None


async def finance_manager_node(state: ResearchState, config: RunnableConfig) -> dict:
    ctx = get_ctx(config)
    ctx.status("finance_manager", "running", "Planning financial tasks")
    period = PERIOD_BY_DEPTH[state.depth.value]
    plan = await ctx.ask(
        "finance_manager", "plan_finance", "Drafting financial research plan",
        prompts.plan_finance(state.user_query, period), FinancePlan,
        {"query": state.user_query, "period": period},
    )
    plan = plan.model_copy(update={"ticker": _clean_ticker(plan.ticker), "period": period})
    ctx.publish("plan_created", {"manager": "finance", "tasks": plan.tasks})
    ctx.log("finance_manager", plan.rationale)
    ctx.status("finance_manager", "done")

    tasks = [
        Task(manager="finance", worker="financial_data", description=f"Price history for {plan.ticker or 'unknown ticker'}"),
        Task(manager="finance", worker="calculator", description="Return, volatility and drawdown"),
    ]
    return {"research_plan": {"finance": plan.model_dump(mode="json")}, "tasks": tasks}


async def financial_data_node(state: ResearchState, config: RunnableConfig) -> dict:
    ctx = get_ctx(config)
    plan = FinancePlan.model_validate(state.research_plan["finance"])
    task = next(t for t in state.tasks if t.worker == "financial_data")

    if not plan.ticker:
        ctx.status("financial_data", "skipped", "No company or ticker in the query")
        ctx.log("financial_data", "No company or ticker found; name one or add a symbol such as $TSLA", level="warn")
        failed = task.model_copy(update={"status": TaskStatus.FAILED, "error": "No ticker"})
        return {"tasks": [failed], "errors": ["financial_data: no company or ticker identified in the query"]}

    ctx.status("financial_data", "running", "Fetching price history")
    ctx.log("financial_data", f"Fetching daily prices for {plan.ticker} ({plan.period}) from {ctx.prices.name}")
    last_error: Exception | None = None
    for attempt in range(1, FETCH_ATTEMPTS + 1):
        try:
            points = await asyncio.to_thread(ctx.prices.history, plan.ticker, plan.period)
            break
        except Exception as exc:  # D12: any worker failure is reported, never fatal
            last_error = exc if isinstance(exc, MarketDataError) else MarketDataError(f"{type(exc).__name__}: {exc}")
            if attempt < FETCH_ATTEMPTS:
                ctx.log("financial_data", f"{exc}; retrying", level="warn")
                await asyncio.sleep(1.0)
    else:
        ctx.status("financial_data", "error", "Price data unavailable")
        ctx.log("financial_data", f"Gave up after {FETCH_ATTEMPTS} attempts: {last_error}", level="error")
        failed = task.model_copy(update={"status": TaskStatus.FAILED, "error": str(last_error)})
        return {"tasks": [failed], "errors": [f"financial_data: {last_error}"]}

    source = ctx.prices.source_for(plan.ticker, points)
    ctx.publish("source_found", source.model_dump(mode="json"))
    ctx.log("financial_data", f"Price history loaded: {len(points)} trading days")
    ctx.status("financial_data", "done")
    done = task.model_copy(update={"status": TaskStatus.DONE})
    return {"financial_data": points, "sources": [source], "tasks": [done]}


async def data_analysis_node(state: ResearchState, config: RunnableConfig) -> dict:
    ctx = get_ctx(config)
    task = next(t for t in state.tasks if t.worker == "calculator")
    if len(state.financial_data) < 2:
        ctx.status("calculator", "skipped", "No price data to analyse")
        return {"tasks": [task.model_copy(update={"status": TaskStatus.FAILED, "error": "No price data"})]}

    ctx.status("calculator", "running", "Computing returns")
    calculations, chart = analyse_prices(state.financial_data)
    for calc in calculations:
        ctx.publish("calculation_ready", calc.model_dump(mode="json"))
    ctx.log("calculator", "Computed period return, volatility and maximum drawdown with pandas")
    ctx.publish("chart_ready", chart.model_dump(mode="json"))
    ctx.status("calculator", "done")
    done = task.model_copy(update={"status": TaskStatus.DONE})
    return {"calculations": calculations, "charts": [chart], "tasks": [done]}
