"""Report Architect: one LLM call writes the report; code fills every figure (D20)."""

from __future__ import annotations

from datetime import datetime, timezone

from langchain_core.runnables import RunnableConfig

from app.graph.context import get_ctx
from app.models.llm_outputs import FinancePlan, ReportDraft
from app.models.schemas import Domain, ExecutionStatus, ResearchState
from app.providers import prompts
from app.utils.placeholders import RenderAudit, render


def _gaps(state: ResearchState) -> list[str]:
    gaps = []
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
        "gaps": _gaps(state),
    }
    draft = await ctx.ask(
        "report_architect", "report", "Writing the report from stored calculations",
        prompts.report(state.user_query, context), ReportDraft, context,
    )

    calcs = {c.id: c for c in state.calculations}
    audit = RenderAudit()
    sections = [
        {
            "id": f"s{i}",
            "heading": section.heading,
            "paragraphs": [render(p, calcs, audit) for p in section.paragraphs],
        }
        for i, section in enumerate(draft.sections, start=1)
    ]
    if audit.unresolved:
        ctx.log("report_architect", f"Removed {len(audit.unresolved)} figure(s) with no stored calculation", level="warn")
    if audit.free_numbers:
        ctx.log("report_architect", f"Flagged {len(audit.free_numbers)} number(s) written outside placeholders", level="warn")
    ctx.log("report_architect", f"Filled {len(audit.resolved)} figure(s) from stored calculations")

    report = {
        "title": draft.title,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "domains": [d.value for d in state.detected_domains],
        "demo_mode": state.demo_mode,
        "sections": sections,
        "audit": {
            "resolved": audit.resolved,
            "unresolved": audit.unresolved,
            "free_numbers": audit.free_numbers,
            "clean": audit.clean,
        },
    }
    ctx.status("report_architect", "done")
    return {"report": report, "execution_status": ExecutionStatus.COMPLETED}
