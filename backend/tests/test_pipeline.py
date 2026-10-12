"""End-to-end runs of the LangGraph pipeline, offline (stand-in LLM, fixture prices)."""

import asyncio
from datetime import date

import pytest

from app.config import Settings
from app.models.llm_outputs import ClaimExtraction, ExtractedClaim
from app.models.schemas import ClaimType, Domain, ExecutionStatus, ResearchRequest, Source, SourceType
from app.providers.base import LLMError
from app.providers.fake import FakeLLMProvider, same_case
from app.runs import RunRegistry
from app.utils.placeholders import format_calculation
from app.graph.context import LiveWorkers
from tests.fixtures import FailingPrices, FakeCourts, FakeFilings, FakeWeb, FixturePrices, offline_live


def run_once(query: str, mode: str = "auto", prices=None, llm=None, budget: int = 8, live=None):
    async def scenario():
        registry = RunRegistry(
            Settings(llm_call_budget=budget), llm=llm, prices=prices or FixturePrices(), live=live or offline_live()
        )
        run = registry.start(ResearchRequest(query=query, mode=mode))
        await run.task
        return run

    return asyncio.run(scenario())


def types_of(run):
    return [e.type for e in run.bus.history]


def report_text(report) -> str:
    parts = []
    for section in report.sections:
        for block in section.blocks:
            if block.type in ("paragraph", "callout"):
                parts.append(block.text)
            elif block.type == "bullets":
                parts += [item.text for item in block.items]
    return " ".join(parts)


def llm_calls(run):
    return sum(1 for e in run.bus.history if e.type == "activity_log" and e.payload["llm_call"])


def test_finance_run_end_to_end():
    run = run_once("How has Tesla stock performed?")
    types = types_of(run)

    assert types[0] == "agent_status" and types[-1] == "report_ready"
    for expected in ("domain_classified", "plan_created", "source_found", "chart_ready"):
        assert expected in types
    assert types.count("calculation_ready") == 4  # return, volatility, drawdown + the results filing window
    seqs = [e.seq for e in run.bus.history]
    assert seqs == list(range(1, len(seqs) + 1))
    assert run.bus.closed

    assert llm_calls(run) == 4  # router, finance manager, claim extraction, report architect
    state = run.state
    assert state.execution_status == ExecutionStatus.COMPLETED
    assert state.research_plan["finance"]["ticker"] == "TSLA"
    assert len(state.financial_data) == 10
    assert {s.retrieved_by for s in state.sources} == {"financial_data", "web_research"}  # prices + EDGAR + web
    assert any(c.id.startswith("ret_results_") for c in state.calculations)

    report = state.report
    assert report.audit.clean is True
    assert report.audit.citations_resolved > 0 and not report.audit.citations_removed
    text = report_text(report)
    for calc in state.calculations:
        assert format_calculation(calc) in text  # every figure came from a stored calculation
    assert "{{calc:" not in text and "not legal or investment advice" in text

    kinds = [s.kind.value for s in report.sections]
    assert kinds[0] == "executive_summary"
    assert {"market_reaction", "data_analysis", "limitations", "sources", "disclaimer"} <= set(kinds)
    assert "case_overview" not in kinds  # a finance-only report has no legal sections
    finance_ids = [s.id for s in state.sources if s.retrieved_by == "financial_data"]
    summary = report.sections[0].blocks[0]
    assert summary.citations == finance_ids  # cites the price data and filings it relies on

    # The report_ready event carries the full report for the browser.
    ready = run.bus.history[-1]
    assert ready.payload["report"]["research_id"] == state.research_id
    assert ready.payload["report"]["audit"]["clean"] is True


def test_manual_domain_choice_skips_router_call():
    run = run_once("How has Tesla stock performed?", mode="finance")
    classified = next(e for e in run.bus.history if e.type == "domain_classified")
    assert classified.payload["domains"] == ["finance"]
    assert "manually" in classified.payload["rationale"]
    assert llm_calls(run) == 3


def test_legal_only_run_searches_courts_and_web():
    courts, web = FakeCourts(), FakeWeb()
    run = run_once("Latest status of the antitrust case against Example Corp", live=LiveWorkers(courts=courts, web=web))
    types = types_of(run)
    assert "chart_ready" not in types and types[-1] == "report_ready"
    plan = run.state.research_plan["legal"]
    assert plan["court_query"] == "Example Corp antitrust"
    assert courts.queries == ["Example Corp antitrust"]
    assert {s.id for s in run.state.sources} == {"cl_1", "web_1", "web_2"}
    statuses = {e.payload["agent"]: e.payload["status"] for e in run.bus.history if e.type == "agent_status"}
    assert statuses["legal_manager"] == statuses["legal_records"] == statuses["web_research"] == "done"
    assert statuses["verification"] == "done"
    assert llm_calls(run) == 4  # router, legal manager, claim extraction, report architect

    report = run.state.report
    assert report.audit.clean
    kinds = [s.kind.value for s in report.sections]
    assert kinds[:4] == ["executive_summary", "key_findings", "case_overview", "legal_developments"]
    assert "data_analysis" not in kinds and "market_reaction" not in kinds
    overview = next(s for s in report.sections if s.kind.value == "case_overview")
    assert overview.blocks[0].citations == ["cl_1"]
    assert "cited but were not read" in report_text(report)


def test_no_court_record_is_never_invented():
    run = run_once("Latest status of the antitrust case against Example Corp", live=LiveWorkers(courts=FakeCourts(sources=[]), web=FakeWeb()))
    warnings = [e.payload["message"] for e in run.bus.history if e.type == "activity_log" and e.payload["level"] == "warn"]
    assert any("No primary court record found" in w for w in warnings)
    assert "does not invent one" in report_text(run.state.report)


def test_court_outage_does_not_crash_the_run():
    run = run_once("Latest status of the antitrust case against Example Corp", live=LiveWorkers(courts=FakeCourts(fail=True), web=FakeWeb()))
    statuses = [(e.payload["agent"], e.payload["status"]) for e in run.bus.history if e.type == "agent_status"]
    assert ("legal_records", "error") in statuses
    assert types_of(run)[-1] == "report_ready"
    assert "simulated court outage" in report_text(run.state.report)


def test_gpt_researcher_style_search_counts_its_llm_calls():
    run = run_once("Latest status of the antitrust case against Example Corp", live=LiveWorkers(courts=FakeCourts(), web=FakeWeb(llm_calls_per_query=1)))
    web_calls = [e for e in run.bus.history if e.type == "activity_log" and e.payload["llm_call"] and e.payload["agent"] == "web_research"]
    assert len(web_calls) == 2  # one per search query in the legal plan


def test_missing_live_services_are_reported_not_faked():
    run = run_once("Latest status of the antitrust case against Example Corp", live=LiveWorkers())
    skipped = {e.payload["agent"]: e.payload.get("detail") for e in run.bus.history
               if e.type == "agent_status" and e.payload["status"] == "skipped"}
    assert "No court-records service configured" in skipped["legal_records"]
    assert "No web search configured" in skipped["web_research"]


def test_failed_price_fetch_does_not_crash_the_run():
    prices = FailingPrices()
    run = run_once("How has Tesla stock performed?", prices=prices)
    assert len(prices.calls) == 2  # bounded retries
    statuses = [(e.payload["agent"], e.payload["status"]) for e in run.bus.history if e.type == "agent_status"]
    assert ("financial_data", "error") in statuses
    assert ("calculator", "skipped") in statuses
    assert types_of(run)[-1] == "report_ready"
    assert run.state.execution_status == ExecutionStatus.COMPLETED
    limitations = next(s for s in run.state.report.sections if s.kind.value == "limitations")
    assert any("simulated outage" in item.text for item in limitations.blocks[0].items)


def test_budget_exceeded_fails_cleanly():
    run = run_once("How has Tesla stock performed?", budget=1)
    assert types_of(run)[-1] == "error"
    assert run.state.execution_status == ExecutionStatus.FAILED
    statuses = [(e.payload["agent"], e.payload["status"]) for e in run.bus.history if e.type == "agent_status"]
    assert ("finance_manager", "error") in statuses  # was running when the budget ran out


class BrokenGemini:
    """Behaves like Gemini returning errors (quota, outage)."""

    name = "gemini"

    async def generate(self, purpose, prompt, schema, context):
        raise LLMError("Gemini request failed: ResourceExhausted")


def test_gemini_failure_falls_back_to_rules_and_says_so():
    run = run_once("How has Tesla stock performed?", llm=BrokenGemini())
    warnings = [e.payload["message"] for e in run.bus.history if e.type == "activity_log" and e.payload["level"] == "warn"]
    assert any("rule-based fallback" in w for w in warnings)
    assert types_of(run)[-1] == "report_ready"
    assert llm_calls(run) == 4  # failed attempts still count against the budget


def test_stand_in_calls_are_labelled():
    run = run_once("How has Tesla stock performed?", llm=FakeLLMProvider())
    llm_logs = [e.payload["message"] for e in run.bus.history if e.type == "activity_log" and e.payload["llm_call"]]
    assert all("rule-based stand-in" in m for m in llm_logs)


# ── live claim extraction (Phase 6) ───────────────────────────────
def claims_by_id(run):
    return {c.id: c for c in run.state.claims}


def test_live_finance_claims_come_from_calculations_and_filings():
    run = run_once("How has Tesla stock performed?")
    claims = claims_by_id(run)
    calcs = {c.id: c for c in run.state.calculations}
    period = claims["claim_ret_period"]
    assert period.verification.value == "verified" and period.claim_type.value == "established_fact"
    assert format_calculation(calcs["ret_period"]) in period.text and "{{calc:" not in period.text
    assert period.value == calcs["ret_period"].result
    results = next(c for i, c in claims.items() if i.startswith("claim_ret_results_"))
    assert "edgar_1" in results.source_ids and results.event_date is not None
    filing = claims["claim_edgar_1"]
    assert filing.claim_type.value == "company_statement" and filing.verification.value == "verified"
    assert sum(1 for e in run.bus.history if e.type == "claim_verified") == len(claims)
    kinds = [s.kind.value for s in run.state.report.sections]
    assert "key_findings" in kinds and "timeline" not in kinds  # no dated case milestones in a finance run


def test_live_legal_claims_build_a_timeline_from_dockets():
    other = Source(id="cl_2", title="Richards v. Corp (Other Court, No. 2:26-cv-00002)", url="https://www.courtlistener.com/docket/2/x/",
                   source_type=SourceType.OFFICIAL_COURT, retrieved_by="legal_records", published_date=date(2026, 4, 1),
                   snippet="Other Court, No. 2:26-cv-00002. Filed 2026-04-01. Terminated 2026-06-30.")
    courts = FakeCourts(sources=[*FakeCourts().sources, other])
    run = run_once("What is the latest in Example v. Corp?", mode="legal", live=LiveWorkers(courts=courts, web=FakeWeb()))
    claims = claims_by_id(run)
    assert set(claims) == {"claim_cl_1", "claim_cl_2"}  # the stand-in does not read the two web pages
    assert all(c.verification.value == "verified" for c in claims.values())
    assert "2 March 2026" in claims["claim_cl_1"].text
    assert "closed on 30 June 2026" in claims["claim_cl_2"].text
    # Only the case the question names goes on its timeline.
    assert [(t.label, t.source_ids) for t in run.state.timeline] == [("Case filed in Test Court", ["cl_1"])]
    assert any(e.type == "timeline_ready" for e in run.bus.history)


@pytest.mark.parametrize(("case", "caption", "same"), [
    ("United States v. Google LLC", "USA v. Google LLC", True),
    ("United States v. Google LLC", "UNITED STATES OF AMERICA v. GOOGLE LLC", True),
    ("United States v. Google LLC", "Richards v. Google LLC", False),
    ("SEC v. Elon Musk", "Securities and Exchange Commission v. Musk", True),
    (None, "USA v. Google LLC", False),
])
def test_docket_captions_are_matched_to_the_named_case(case, caption, same):
    assert same_case(case, caption) is same


def test_nothing_retrieved_means_nothing_to_verify():
    run = run_once("Latest status of the antitrust case against Example Corp", live=LiveWorkers())
    statuses = {e.payload["agent"]: e.payload for e in run.bus.history if e.type == "agent_status"}
    assert statuses["verification"]["status"] == "skipped"
    assert llm_calls(run) == 3  # no extraction call is spent on an empty run
    assert run.state.claims == []


class ScriptedGemini:
    """Stands in for Gemini with fixed answers, so the model path runs offline."""

    name = "gemini"

    def __init__(self, fail_on: set[str] = frozenset()) -> None:
        self.fail_on = fail_on
        self.stand_in = FakeLLMProvider()
        self.purposes: list[str] = []

    async def generate(self, purpose, prompt, schema, context):
        self.purposes.append(purpose)
        if purpose in self.fail_on:
            raise LLMError("Gemini request failed: HTTP 429 (rate limit or free-tier quota)")
        if purpose == "extract_claims":
            return ClaimExtraction(claims=[
                ExtractedClaim(id="c1", text="The regulator announced an investigation.", claim_type=ClaimType.ESTABLISHED_FACT,
                               source_ids=["web_1"], domain=Domain.LEGAL, event_date=date(2026, 3, 9), timeline_label="Investigation announced"),
                ExtractedClaim(id="c2", text="Reuters reports that the company denies wrongdoing.", claim_type=ClaimType.ESTABLISHED_FACT,
                               source_ids=["web_2", "web_404"], domain=Domain.LEGAL, event_date=date(2026, 3, 10), timeline_label="Company responds"),
                ExtractedClaim(id="c3", text="A complaint was filed.", claim_type=ClaimType.ESTABLISHED_FACT,
                               source_ids=["cl_1"], domain=Domain.LEGAL, event_date=date(2026, 3, 2), timeline_label="Complaint filed"),
            ])
        return await self.stand_in.generate(purpose, prompt, schema, context)


def test_model_extracted_claims_are_still_judged_by_rules():
    gemini = ScriptedGemini()
    run = run_once("Latest status of the antitrust case against Example Corp", llm=gemini,
                   live=LiveWorkers(courts=FakeCourts(), web=FakeWeb(llm_calls_per_query=1)))
    assert "extract_claims" in gemini.purposes
    claims = claims_by_id(run)
    assert claims["c1"].verification.value == "verified"  # a regulator's own page
    assert claims["c2"].claim_type.value == "news_report"  # one news site cannot make an established fact
    assert claims["c2"].verification.value == "unverified" and claims["c2"].source_ids == ["web_2"]
    # Only verified milestones reach the timeline, in date order.
    assert [t.label for t in run.state.timeline] == ["Complaint filed", "Investigation announced"]
    assert llm_calls(run) <= 8
    assert "extracted by the model from search excerpts" in report_text(run.state.report)


def test_failed_extraction_falls_back_and_the_report_says_so():
    run = run_once("Latest status of the antitrust case against Example Corp", llm=ScriptedGemini(fail_on={"extract_claims"}),
                   live=LiveWorkers(courts=FakeCourts(), web=FakeWeb()))
    assert set(claims_by_id(run)) == {"claim_cl_1"}  # the stand-in's structured-record claims
    text = report_text(run.state.report)
    assert "Gemini did not answer for: extract claims" in text
    assert "cited but were not read" in text


def test_stand_in_summary_names_only_the_records_it_used():
    legal = report_text(run_once("What is the latest in Example v. Corp?", mode="legal", live=LiveWorkers(courts=FakeCourts(), web=FakeWeb())).state.report)
    assert "structured records (court dockets)" in legal
    finance = report_text(run_once("How has Tesla stock performed?").state.report)
    assert "structured records (computed price figures and SEC filings)" in finance
