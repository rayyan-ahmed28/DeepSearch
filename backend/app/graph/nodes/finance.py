"""Finance side: Finance Manager (LLM plan) and two deterministic workers.

Every node does nothing when Finance is not in the run's domains, so the
graph's shape (and its join points) is the same for every run.
"""

from __future__ import annotations

import asyncio
import re

from langchain_core.runnables import RunnableConfig

from app.graph.context import get_ctx
from app.models.llm_outputs import FinancePlan
from app.models.schemas import Domain, ResearchState, Task, TaskStatus
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
    if Domain.FINANCE not in state.detected_domains:
        return {}
    ctx.status("finance_manager", "running", "Planning financial tasks")
    await ctx.pause()
    default_period = PERIOD_BY_DEPTH[state.depth.value]  # used unless the question names a time frame
    plan = await ctx.ask(
        "finance_manager", "plan_finance", "Drafting financial research plan",
        prompts.plan_finance(state.user_query, default_period), FinancePlan,
        {"query": state.user_query, "period": default_period},
    )
    plan = plan.model_copy(update={"ticker": _clean_ticker(plan.ticker)})
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
    if "finance" not in state.research_plan:
        return {}
    plan = FinancePlan.model_validate(state.research_plan["finance"])
    task = next(t for t in state.tasks if t.worker == "financial_data")

    if not plan.ticker:
        ctx.status("financial_data", "skipped", "No company or ticker in the query")
        ctx.log("financial_data", "No company or ticker found; name one or add a symbol such as $TSLA", level="warn")
        failed = task.model_copy(update={"status": TaskStatus.FAILED, "error": "No ticker"})
        return {"tasks": [failed], "errors": ["financial_data: no company or ticker identified in the query"]}

    ctx.status("financial_data", "running", "Fetching price history")
    await ctx.pause()
    ctx.log("financial_data", f"Fetching daily prices for {plan.ticker} from {ctx.prices.name}")
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

    sources = [ctx.prices.source_for(plan.ticker, points)]
    if ctx.scenario is not None:  # filings this worker retrieved when the scenario was recorded
        sources += [s for s in ctx.scenario.sources if s.retrieved_by == "financial_data"]
    for source in sources:
        ctx.publish("source_found", source.model_dump(mode="json"))
    ctx.log("financial_data", f"Price history loaded: {len(points)} trading days ({points[0].date} to {points[-1].date})")
    ctx.status("financial_data", "done")
    done = task.model_copy(update={"status": TaskStatus.DONE})
    return {"financial_data": points, "sources": sources, "tasks": [done]}


async def data_analysis_node(state: ResearchState, config: RunnableConfig) -> dict:
    ctx = get_ctx(config)
    if "finance" not in state.research_plan:
        return {}
    plan = FinancePlan.model_validate(state.research_plan["finance"])
    task = next(t for t in state.tasks if t.worker == "calculator")
    if len(state.financial_data) < 2:
        ctx.status("calculator", "skipped", "No price data to analyse")
        return {"tasks": [task.model_copy(update={"status": TaskStatus.FAILED, "error": "No price data"})]}

    ctx.status("calculator", "running", "Computing returns")
    await ctx.pause()
    calculations, chart = analyse_prices(state.financial_data, plan.events)
    for calc in calculations:
        ctx.publish("calculation_ready", calc.model_dump(mode="json"))
    windows = len(calculations) - 3
    extra = f", plus {windows} event-window return(s)" if windows else ""
    ctx.log("calculator", f"Computed period return, volatility and maximum drawdown with pandas{extra}")
    for event in plan.events:
        if not any(c.id == f"ret_{event.id}" for c in calculations):
            ctx.log("calculator", f"No price data around {event.label} ({event.date}); window skipped", level="warn")
    ctx.publish("chart_ready", chart.model_dump(mode="json"))
    ctx.status("calculator", "done")
    done = task.model_copy(update={"status": TaskStatus.DONE})
    return {"calculations": calculations, "charts": [chart], "tasks": [done]}
