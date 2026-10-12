"""Turn the Report Architect's draft into the final `Report` (contract in models/schemas.py).

The LLM writes only narrative paragraphs. Code then:
- fills every {{calc:<id>}} from stored calculations (D20),
- keeps only citations that point to a source this run actually retrieved,
- drops sections that don't fit the run's domains (no "Case overview" on a finance-only run),
- adds the sections that need no LLM: key findings, data analysis, timeline,
  limitations, sources and the disclaimer,
and records all of it in the report's audit.
"""

from __future__ import annotations

from app.models.llm_outputs import ReportDraft
from app.models.schemas import (
    BulletsBlock,
    CalculationsBlock,
    CalloutBlock,
    ChartBlock,
    CitedText,
    Domain,
    FindingBlock,
    ParagraphBlock,
    Report,
    ReportAudit,
    ReportSection,
    ResearchState,
    SectionKind,
    SourcesBlock,
    TimelineBlock,
)
from app.utils.placeholders import RenderAudit, render

DOMAIN_SECTIONS = {
    Domain.LEGAL: {SectionKind.CASE_OVERVIEW, SectionKind.LEGAL_DEVELOPMENTS},
    Domain.FINANCE: {SectionKind.FINANCIAL_IMPACT, SectionKind.MARKET_REACTION},
}
ALWAYS_ALLOWED = {SectionKind.EXECUTIVE_SUMMARY, SectionKind.RISK_FACTORS}

DISCLAIMER = (
    "This report is research information, not legal or investment advice. Allegations are reported as "
    "allegations, market effects as possibilities, and past price movements do not predict future returns."
)


def allowed_narrative(domains: list[Domain]) -> set[SectionKind]:
    allowed = set(ALWAYS_ALLOWED)
    for domain in domains:
        allowed |= DOMAIN_SECTIONS[domain]
    return allowed


def build_report(state: ResearchState, draft: ReportDraft, llm_provider: str, gaps: list[str]) -> Report:
    figures = RenderAudit()
    calcs = {c.id: c for c in state.calculations}
    known_sources = {s.id for s in state.sources}
    citations_removed: list[str] = []
    citations_resolved = 0

    def keep_citations(ids: list[str]) -> list[str]:
        nonlocal citations_resolved
        kept: list[str] = []
        for source_id in ids:
            if source_id not in known_sources:
                citations_removed.append(source_id)
            elif source_id not in kept:
                kept.append(source_id)
                citations_resolved += 1
        return kept

    allowed = allowed_narrative(state.detected_domains)
    sections: dict[SectionKind, ReportSection] = {}
    dropped: list[str] = []

    for draft_section in draft.sections:
        kind = SectionKind(draft_section.kind)
        if kind not in allowed:
            dropped.append(kind.value)
            continue
        blocks = [
            ParagraphBlock(text=render(p.text, calcs, figures), citations=keep_citations(p.source_ids))
            for p in draft_section.paragraphs
        ]
        if kind in sections:  # two drafts of the same kind become one section
            sections[kind].blocks.extend(blocks)
        else:
            sections[kind] = ReportSection(id=kind.value, kind=kind, heading=draft_section.heading, blocks=blocks)

    def add(kind: SectionKind, heading: str, blocks: list) -> None:
        sections[kind] = ReportSection(id=kind.value, kind=kind, heading=heading, blocks=blocks)

    if state.claims:
        add(SectionKind.KEY_FINDINGS, "Key findings", [FindingBlock(claim_id=c.id) for c in state.claims])
    if state.charts or state.calculations:
        blocks: list = [ChartBlock(chart_id=c.id) for c in state.charts]
        if state.calculations:
            blocks.append(CalculationsBlock(calculation_ids=[c.id for c in state.calculations]))
        add(SectionKind.DATA_ANALYSIS, "Data analysis", blocks)
    if state.timeline:
        add(SectionKind.TIMELINE, "Timeline", [TimelineBlock()])
    if gaps:
        add(SectionKind.LIMITATIONS, "What this run did not cover", [BulletsBlock(items=[CitedText(text=g) for g in gaps])])
    if state.sources:
        add(SectionKind.SOURCES, "Sources and evidence", [SourcesBlock()])
    add(SectionKind.DISCLAIMER, "Important", [CalloutBlock(tone="info", text=DISCLAIMER)])

    audit = ReportAudit(
        figures_filled=figures.resolved,
        figures_unresolved=figures.unresolved,
        free_numbers=figures.free_numbers,
        citations_resolved=citations_resolved,
        citations_removed=citations_removed,
        sections_dropped=dropped,
    )
    return Report(
        research_id=state.research_id,
        title=draft.title,
        query=state.user_query,
        domains=state.detected_domains,
        demo_mode=state.demo_mode,
        llm_provider=llm_provider,
        sections=[sections[k] for k in SectionKind if k in sections],  # enum order = display order
        sources=state.sources,
        claims=state.claims,
        calculations=state.calculations,
        charts=state.charts,
        timeline=state.timeline,
        audit=audit,
    )
