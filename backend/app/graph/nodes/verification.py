"""Verification: one LLM call extracts claims (D19); deterministic rules set every status."""

from __future__ import annotations

from collections import Counter

from langchain_core.runnables import RunnableConfig

from app.graph.context import get_ctx
from app.models.llm_outputs import ClaimExtraction
from app.models.schemas import ResearchState
from app.providers import prompts
from app.workers.verification import verify_claims


async def verification_node(state: ResearchState, config: RunnableConfig) -> dict:
    ctx = get_ctx(config)
    if ctx.scenario is None:
        # Live claim extraction is not built yet; rules below already run on recorded runs.
        ctx.status("verification", "skipped", "Not built yet (comes in a later phase)")
        return {}

    ctx.status("verification", "running", "Extracting claims")
    await ctx.pause()
    extraction = await ctx.ask(
        "verification", "extract_claims", "Extracting claims and linking them to sources",
        prompts.extract_claims(state.user_query, state.sources, state.calculations), ClaimExtraction,
        {"query": state.user_query},
    )
    ctx.log("verification", "Applying source-hierarchy rules to each claim (code, not the LLM)")
    claims, audit, notes = verify_claims(extraction.claims, state.sources, state.calculations)
    for note in notes:
        ctx.log("verification", note, level="warn")
    # Claims quote their sources, so stated figures (e.g. a penalty amount) are allowed;
    # what must never happen is a placeholder with no stored calculation behind it.
    if audit.unresolved:
        ctx.log("verification", f"Claim figure(s) with no stored calculation: {', '.join(audit.unresolved)}", level="warn")
    for claim in claims:
        await ctx.pause(0.4)
        ctx.publish("claim_verified", claim.model_dump(mode="json"))

    # The case timeline, keeping only entries whose sources this run actually retrieved.
    known = {s.id for s in state.sources}
    timeline = [t for t in ctx.scenario.timeline if all(i in known for i in t.source_ids)]
    if timeline:
        ctx.publish("timeline_ready", {"events": [t.model_dump(mode="json") for t in timeline]})

    counts = Counter(c.verification.value for c in claims)
    summary = ", ".join(f"{n} {status}" for status, n in sorted(counts.items()))
    ctx.log("verification", f"Verification summary written from rule results: {summary}")
    ctx.status("verification", "done")
    return {"claims": claims, "timeline": timeline}
