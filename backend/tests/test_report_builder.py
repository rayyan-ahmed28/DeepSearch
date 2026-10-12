"""The report builder enforces the report rules no matter what the LLM writes."""

from app.models.llm_outputs import DraftParagraph, DraftSection, ReportDraft
from app.models.schemas import (
    Calculation,
    Claim,
    ClaimType,
    Domain,
    Report,
    ResearchState,
    SectionKind,
    Source,
    SourceType,
)
from app.utils.report_builder import build_report


def finance_state() -> ResearchState:
    state = ResearchState(user_query="How did Example Corp shares do?")
    state.detected_domains = [Domain.FINANCE]
    state.sources = [Source(id="src1", title="Prices", url="https://example.com", source_type=SourceType.SECONDARY, retrieved_by="financial_data")]
    state.calculations = [Calculation(id="ret_period", description="Return", result=-4.26, method="pandas", unit="%")]
    return state


def test_builder_drops_wrong_domain_sections_and_bad_citations():
    draft = ReportDraft(
        title="Example Corp",
        sections=[
            DraftSection(kind="executive_summary", heading="Summary", paragraphs=[
                DraftParagraph(text="Shares returned {{calc:ret_period}}.", source_ids=["src1", "src1", "made_up"]),
            ]),
            DraftSection(kind="case_overview", heading="The case", paragraphs=[DraftParagraph(text="A legal paragraph.")]),
            DraftSection(kind="market_reaction", heading="Market", paragraphs=[
                DraftParagraph(text="Volatility was {{calc:missing}}, around 40 percent."),
            ]),
        ],
    )
    report = build_report(finance_state(), draft, llm_provider="fake", gaps=["Legal side not built."])

    kinds = [s.kind for s in report.sections]
    assert SectionKind.CASE_OVERVIEW not in kinds
    assert report.audit.sections_dropped == ["case_overview"]
    summary = report.sections[0].blocks[0]
    assert summary.text == "Shares returned -4.3%."
    assert summary.citations == ["src1"]  # duplicate collapsed, invented id removed
    assert report.audit.citations_removed == ["made_up"]
    market = next(s for s in report.sections if s.kind == SectionKind.MARKET_REACTION)
    assert "[figure unavailable]" in market.blocks[0].text
    assert report.audit.figures_unresolved == ["missing"] and report.audit.free_numbers == ["40"]
    assert report.audit.clean is False


def test_builder_adds_deterministic_sections_in_order():
    state = finance_state()
    state.detected_domains = [Domain.LEGAL, Domain.FINANCE]
    state.claims = [Claim(id="c1", text="The regulator alleges X.", claim_type=ClaimType.ALLEGATION, source_ids=["src1"])]
    draft = ReportDraft(title="T", sections=[
        DraftSection(kind="risk_factors", heading="Risks", paragraphs=[DraftParagraph(text="Outcomes are uncertain.")]),
        DraftSection(kind="executive_summary", heading="Summary", paragraphs=[DraftParagraph(text="Overview.", source_ids=["src1"])]),
    ])
    report = build_report(state, draft, llm_provider="fake", gaps=["Gap."])

    assert [s.kind.value for s in report.sections] == [
        "executive_summary", "key_findings", "data_analysis", "risk_factors", "limitations", "sources", "disclaimer",
    ]
    findings = next(s for s in report.sections if s.kind == SectionKind.KEY_FINDINGS)
    assert findings.blocks[0].claim_id == "c1"
    assert report.audit.clean is True

    # Round-trips through JSON with block types intact (what the browser receives).
    again = Report.model_validate_json(report.model_dump_json())
    assert [b.type for b in again.sections[2].blocks] == ["calculations"]
    assert '"clean":true' in report.model_dump_json().replace(" ", "")
