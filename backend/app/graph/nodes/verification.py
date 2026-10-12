"""Verification: one LLM call extracts claims (D19); deterministic rules set every status.

Live runs extract claims from what this run retrieved. Gemini reads every
source excerpt; the rule-based stand-in states only what structured records
show (computed figures, SEC filings, court dockets). Recorded runs replay the
extraction captured with the scenario. Either way, code sets the statuses.
"""

from __future__ import annotations

from collections import Counter

from langchain_core.runnables import RunnableConfig

from app.graph.context import RunContext, get_ctx
from app.models.llm_outputs import ClaimExtraction, ExtractedClaim, FinancePlan, LegalPlan
from app.models.schemas import Claim, ResearchState, TimelineEvent, VerificationStatus
from app.providers import prompts
from app.workers.verification import verify_claims

TIMELINE_STATUSES = {VerificationStatus.VERIFIED, VerificationStatus.CORROBORATED}


def _context(state: ResearchState) -> dict:
    plan = FinancePlan.model_validate(state.research_plan["finance"]) if "finance" in state.research_plan else None
    legal = LegalPlan.model_validate(state.research_plan["legal"]) if "legal" in state.research_plan else None
    prices = state.financial_data
    return {
        "query": state.user_query,
        "case_name": legal.case_name if legal else None,
        "company": plan.company if plan else None,
        "ticker": plan.ticker if plan else None,
        "period_start": prices[0].date.isoformat() if prices else None,
        "period_end": prices[-1].date.isoformat() if prices else None,
        "sources": [s.model_dump(mode="json") for s in state.sources],
        "calculations": [c.model_dump(mode="json") for c in state.calculations],
    }


def live_timeline(extracted: list[ExtractedClaim], claims: list[Claim]) -> list[TimelineEvent]:
    """Dated milestones the extractor labelled, kept only when the rules verified or corroborated them."""
    events = [
        TimelineEvent(date=claim.event_date, label=raw.timeline_label, description=claim.text, source_ids=claim.source_ids)
        for raw, claim in zip(extracted, claims)
        if raw.timeline_label and claim.event_date and claim.verification in TIMELINE_STATUSES
    ]
    return sorted(events, key=lambda e: e.date)


async def verification_node(state: ResearchState, config: RunnableConfig) -> dict:
    ctx = get_ctx(config)
    if ctx.scenario is None and not state.sources and not state.calculations:
        ctx.status("verification", "skipped", "Nothing was retrieved to verify")
        return {}

    ctx.status("verification", "running", "Extracting claims")
    await ctx.pause()
    extraction = await ctx.ask(
        "verification", "extract_claims", "Extracting claims and linking them to sources",
        prompts.extract_claims(state.user_query, state.sources, state.calculations), ClaimExtraction,
        _context(state),
    )
    if ctx.scenario is None and ctx.llm.name != "gemini":
        ctx.log("verification", "The stand-in states only what structured records show; news and web pages are cited, not read")
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

    timeline = _timeline(ctx, state, extraction.claims, claims)
    if timeline:
        ctx.publish("timeline_ready", {"events": [t.model_dump(mode="json") for t in timeline]})

    if claims:
        counts = Counter(c.verification.value for c in claims)
        summary = ", ".join(f"{n} {status}" for status, n in sorted(counts.items()))
        ctx.log("verification", f"Verification summary written from rule results: {summary}")
    else:
        ctx.log("verification", "No claims could be stated from the retrieved sources", level="warn")
    ctx.status("verification", "done")
    return {"claims": claims, "timeline": timeline}


def _timeline(ctx: RunContext, state: ResearchState, extracted: list[ExtractedClaim], claims: list[Claim]) -> list[TimelineEvent]:
    if ctx.scenario is None:
        return live_timeline(extracted, claims)
    # The recorded case timeline, keeping only entries whose sources this run actually retrieved.
    known = {s.id for s in state.sources}
    return [t for t in ctx.scenario.timeline if all(i in known for i in t.source_ids)]
