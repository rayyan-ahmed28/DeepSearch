"""Legal side and the shared Web Research worker.

Live runs: not built yet (later phase), so each agent says so instead of
pretending. Recorded demo runs (D21): the plan and the sources each worker
retrieved on the recording date are replayed into the same graph.
"""

from __future__ import annotations

from langchain_core.runnables import RunnableConfig

from app.graph.context import RunContext, get_ctx
from app.models.llm_outputs import LegalPlan
from app.models.schemas import Domain, ResearchState, Source
from app.providers import prompts

NOT_BUILT = "Not built yet (comes in a later phase)"


async def legal_manager_node(state: ResearchState, config: RunnableConfig) -> dict:
    ctx = get_ctx(config)
    if Domain.LEGAL not in state.detected_domains:
        return {}
    if ctx.scenario is None:
        ctx.status("legal_manager", "skipped", NOT_BUILT)
        return {}

    ctx.status("legal_manager", "running", "Planning legal tasks")
    await ctx.pause()
    plan = await ctx.ask(
        "legal_manager", "plan_legal", "Drafting legal research plan",
        prompts.plan_legal(state.user_query), LegalPlan, {"query": state.user_query},
    )
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


async def legal_records_node(state: ResearchState, config: RunnableConfig) -> dict:
    ctx = get_ctx(config)
    if Domain.LEGAL not in state.detected_domains:
        return {}
    if ctx.scenario is None:
        ctx.status("legal_records", "skipped", NOT_BUILT)
        return {}
    ctx.status("legal_records", "running", "Querying court records")
    sources = await _replay_sources(ctx, "legal_records", "Searching court dockets (CourtListener)")
    return {"sources": sources}


async def web_research_node(state: ResearchState, config: RunnableConfig) -> dict:
    ctx = get_ctx(config)
    if ctx.scenario is None:
        ctx.status("web_research", "skipped", NOT_BUILT)
        return {}
    ctx.status("web_research", "running", "Searching and compressing web sources")
    # GPT Researcher spends one sub-query call per active manager (D9); recordings count them too.
    for domain in state.detected_domains:
        ctx.counter.take()
        ctx.log("web_research", f"Generating search sub-queries for the {domain.value} tasks (recorded response, Demo Mode)", llm_call=True)
    sources = await _replay_sources(ctx, "web_research", "Searching official sites and reputable news")
    return {"sources": sources}
