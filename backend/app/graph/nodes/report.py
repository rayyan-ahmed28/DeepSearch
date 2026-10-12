"""Report Architect: one LLM call writes the narrative; code builds and audits the report."""

from __future__ import annotations

from langchain_core.runnables import RunnableConfig

from app.graph.context import RunContext, get_ctx
from app.models.llm_outputs import FinancePlan, ReportDraft
from app.models.schemas import Domain, ExecutionStatus, ResearchState
from app.providers import prompts
from app.utils.report_builder import build_report


def _gaps(state: ResearchState, ctx: RunContext) -> list[str]:
    gaps = []
    if ctx.scenario is not None:
        as_of = ctx.scenario.data_as_of.strftime("%d %B %Y").lstrip("0")
        gaps.append(
            f"This is a recorded demo run. Its sources and model responses were captured on {as_of} and replayed "
            "through the live pipeline; every figure and verification status was recomputed by code during this replay."
        )
        gaps.append(f"Events after {as_of} are not covered.")
        if ctx.scenario.prices is not None:
            gaps.append("Share prices are split-adjusted closes, so they will not match prices quoted in news from the time; percentage moves are unaffected.")
    else:
        if Domain.LEGAL in state.detected_domains:
            gaps.append("Legal research (court records, regulators, case status) is not built yet in this version.")
        gaps.append("Web and news sources are not searched yet, and claims are not yet extracted or verified.")
    for error in state.errors:
        worker, _, detail = error.partition(": ")
        gaps.append(f"The {worker.replace('_', ' ')} step did not complete: {detail}.")
    return gaps


async def report_architect_node(state: ResearchState, config: RunnableConfig) -> dict:
    ctx = get_ctx(config)
    ctx.status("report_architect", "running", "Composing report")
    await ctx.pause()

    plan = FinancePlan.model_validate(state.research_plan["finance"]) if "finance" in state.research_plan else None
    prices = state.financial_data
    context = {
        "query": state.user_query,
        "domains": [d.value for d in state.detected_domains],
        "company": plan.company if plan else None,
        "ticker": plan.ticker if plan else None,
        "period": plan.period if plan else None,
        "period_start": prices[0].date.isoformat() if prices else None,
        "period_end": prices[-1].date.isoformat() if prices else None,
        "calculations": [c.model_dump(mode="json") for c in state.calculations],
        "sources": [{"id": s.id, "title": s.title, "source_type": s.source_type.value} for s in state.sources],
    }
    draft = await ctx.ask(
        "report_architect", "report", "Writing the report from stored calculations",
        prompts.report(state.user_query, context), ReportDraft, context,
    )

    report = build_report(state, draft, llm_provider=ctx.llm.name, gaps=_gaps(state, ctx))
    audit = report.audit
    if audit.figures_unresolved:
        ctx.log("report_architect", f"Removed {len(audit.figures_unresolved)} figure(s) with no stored calculation", level="warn")
    if audit.free_numbers:
        ctx.log("report_architect", f"Flagged {len(audit.free_numbers)} number(s) written outside placeholders", level="warn")
    if audit.citations_removed:
        ctx.log("report_architect", f"Removed {len(audit.citations_removed)} citation(s) that matched no retrieved source", level="warn")
    if audit.sections_dropped:
        ctx.log("report_architect", f"Dropped section(s) that don't fit this run: {', '.join(audit.sections_dropped)}", level="warn")
    ctx.log(
        "report_architect",
        f"Filled {len(audit.figures_filled)} figure(s) from stored calculations; {audit.citations_resolved} citation(s) resolve",
    )
    ctx.status("report_architect", "done")
    return {"report": report, "execution_status": ExecutionStatus.COMPLETED}
