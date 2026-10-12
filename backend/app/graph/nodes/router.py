"""Gateway Router: decide which domains apply (1 LLM call, or 0 with a manual choice)."""

from __future__ import annotations

from langchain_core.runnables import RunnableConfig

from app.graph.context import get_ctx
from app.models.llm_outputs import RouterDecision
from app.models.schemas import Domain, ResearchState
from app.providers import prompts

MANUAL_DOMAINS = {
    "legal": [Domain.LEGAL],
    "finance": [Domain.FINANCE],
    "legal_finance": [Domain.LEGAL, Domain.FINANCE],
}


async def router_node(state: ResearchState, config: RunnableConfig) -> dict:
    ctx = get_ctx(config)
    ctx.status("gateway", "running", "Classifying domain")

    if state.mode_override:
        # D7: a manual choice wins; no LLM call is spent, but the event is still logged.
        domains = MANUAL_DOMAINS[state.mode_override]
        rationale = "Domain chosen manually on the research form (overrides automatic routing)."
        ctx.log("gateway", "Using the domain chosen on the research form")
    else:
        decision = await ctx.ask(
            "gateway", "route", "Classifying query into legal / finance scope",
            prompts.route(state.user_query), RouterDecision, {"query": state.user_query},
        )
        domains = list(dict.fromkeys([decision.primary_domain, *decision.domains]))
        rationale = decision.rationale

    ctx.publish("domain_classified", {"domains": [d.value for d in domains], "rationale": rationale})
    ctx.status("gateway", "done")

    # Agents not built yet in this version say so, instead of sitting idle.
    if Domain.LEGAL in domains:
        ctx.status("legal_manager", "skipped", "Not built yet (legal side comes in a later phase)")
        ctx.status("legal_records", "skipped", "Not built yet")
    ctx.status("web_research", "skipped", "Not built yet")
    ctx.status("verification", "skipped", "Not built yet")

    return {"detected_domains": domains, "primary_domain": domains[0]}
