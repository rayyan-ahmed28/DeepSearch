"""Legal side and the shared Web Research worker.

Live runs: the Legal Manager plans (1 LLM call), Legal Records searches
CourtListener, Web Research searches the web (GPT Researcher, Tavily or
DuckDuckGo, whichever is configured). Recorded demo runs (D21): the plan and
the sources each worker retrieved on the recording date are replayed instead.
A worker that fails says so and the run carries on (D12).
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import TypeVar

from langchain_core.runnables import RunnableConfig

from app.graph.context import RunContext, get_ctx
from app.models.llm_outputs import FinancePlan, LegalPlan
from app.models.schemas import Domain, ResearchState, Source
from app.providers import prompts

# Sources per worker by research depth (D8).
SOURCES_BY_DEPTH = {"quick": 5, "standard": 8, "deep": 12}
ATTEMPTS = 2

R = TypeVar("R")


async def _with_retries(ctx: RunContext, agent: str, call: Callable[[], Awaitable[R]]) -> R:
    """Bounded retries (D12): two attempts, a short pause between them."""
    for attempt in range(1, ATTEMPTS + 1):
        try:
            return await call()
        except Exception as exc:
            if attempt == ATTEMPTS:
                raise
            ctx.log(agent, f"{exc}; retrying", level="warn")
            await asyncio.sleep(1.0)
    raise AssertionError("unreachable")


async def legal_manager_node(state: ResearchState, config: RunnableConfig) -> dict:
    ctx = get_ctx(config)
    if Domain.LEGAL not in state.detected_domains:
        return {}
    ctx.status("legal_manager", "running", "Planning legal tasks")
    await ctx.pause()
    plan = await ctx.ask(
        "legal_manager", "plan_legal", "Drafting legal research plan",
        prompts.plan_legal(state.user_query), LegalPlan, {"query": state.user_query},
    )
    if not plan.court_query:
        plan = plan.model_copy(update={"court_query": plan.case_name or state.user_query})
    if not plan.search_queries:
        plan = plan.model_copy(update={"search_queries": [state.user_query]})
    ctx.publish("plan_created", {"manager": "legal", "tasks": plan.tasks})
    ctx.log("legal_manager", plan.rationale)
    ctx.status("legal_manager", "done")
    return {"research_plan": {"legal": plan.model_dump(mode="json")}}


async def _replay_sources(ctx: RunContext, agent: str, message: str) -> list[Source]:
    """Publish the sources this worker retrieved when the scenario was recorded (agent already running)."""
    assert ctx.scenario is not None
    ctx.log(agent, message)
    sources = [s for s in ctx.scenario.sources if s.retrieved_by == agent]
    for source in sources:
        await ctx.pause(0.5)
        ctx.publish("source_found", source.model_dump(mode="json"))
    ctx.log(agent, f"{len(sources)} source(s) retrieved")
    ctx.status(agent, "done")
    return sources


def _publish(ctx: RunContext, sources: list[Source]) -> None:
    for source in sources:
        ctx.publish("source_found", source.model_dump(mode="json"))


async def legal_records_node(state: ResearchState, config: RunnableConfig) -> dict:
    ctx = get_ctx(config)
    if Domain.LEGAL not in state.detected_domains:
        return {}
    ctx.status("legal_records", "running", "Querying court records")
    if ctx.scenario is not None:
        return {"sources": await _replay_sources(ctx, "legal_records", "Searching court dockets (CourtListener)")}

    courts = ctx.live.courts
    if courts is None:
        ctx.status("legal_records", "skipped", "No court-records service configured")
        return {}
    plan = LegalPlan.model_validate(state.research_plan["legal"])
    limit = SOURCES_BY_DEPTH[state.depth.value]
    ctx.log("legal_records", f"Searching {courts.name} dockets for '{plan.court_query}'")
    try:
        sources = await _with_retries(ctx, "legal_records", lambda: courts.search_dockets(plan.court_query or state.user_query, limit))
    except Exception as exc:
        ctx.status("legal_records", "error", "Court records unavailable")
        ctx.log("legal_records", str(exc), level="error")
        return {"errors": [f"legal_records: {exc}"]}
    _publish(ctx, sources)
    if sources:
        ctx.log("legal_records", f"{len(sources)} docket(s) found")
    else:
        ctx.log("legal_records", "No primary court record found; none will be cited", level="warn")
    ctx.status("legal_records", "done")
    return {"sources": sources}


def _web_queries(state: ResearchState) -> list[str]:
    queries: list[str] = []
    if "legal" in state.research_plan:
        queries += LegalPlan.model_validate(state.research_plan["legal"]).search_queries
    if "finance" in state.research_plan:
        plan = FinancePlan.model_validate(state.research_plan["finance"])
        if plan.company or plan.ticker:
            queries.append(f"{plan.company or plan.ticker} stock news")
    return list(dict.fromkeys(q for q in queries if q.strip()))[:3] or [state.user_query]


async def web_research_node(state: ResearchState, config: RunnableConfig) -> dict:
    ctx = get_ctx(config)
    ctx.status("web_research", "running", "Searching and compressing web sources")
    if ctx.scenario is not None:
        # GPT Researcher spends one sub-query call per active manager (D9); recordings count them too.
        for domain in state.detected_domains:
            ctx.counter.take()
            ctx.log("web_research", f"Generating search sub-queries for the {domain.value} tasks (recorded response, Demo Mode)", llm_call=True)
        return {"sources": await _replay_sources(ctx, "web_research", "Searching official sites and reputable news")}

    web = ctx.live.web
    if web is None:
        ctx.status("web_research", "skipped", "No web search configured")
        return {}
    queries = _web_queries(state)
    for query in queries:
        for _ in range(web.llm_calls_per_query):
            ctx.counter.take()
            ctx.log("web_research", f"Generating search sub-queries for '{query}'", llm_call=True)
    ctx.log("web_research", f"Searching with {web.name}: {'; '.join(queries)}")
    try:
        sources = await _with_retries(ctx, "web_research", lambda: web.search(queries, SOURCES_BY_DEPTH[state.depth.value]))
    except Exception as exc:
        ctx.status("web_research", "error", "Web search unavailable")
        ctx.log("web_research", str(exc), level="error")
        return {"errors": [f"web_research: {exc}"]}
    _publish(ctx, sources)
    kinds = sorted({s.source_type.value.replace("_", " ") for s in sources})
    ctx.log("web_research", f"{len(sources)} source(s) kept ({', '.join(kinds) or 'none'}); social media is never used as evidence")
    ctx.status("web_research", "done")
    return {"sources": sources}
