"""End-to-end runs of the LangGraph pipeline, offline (stand-in LLM, fixture prices)."""

import asyncio

from app.config import Settings
from app.models.schemas import ExecutionStatus, ResearchRequest
from app.providers.base import LLMError
from app.providers.fake import FakeLLMProvider
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

    assert llm_calls(run) == 3  # router, finance manager, report architect
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
    assert llm_calls(run) == 2


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
    assert statuses["verification"] == "skipped"  # live claim extraction comes later
    assert llm_calls(run) == 3  # router, legal manager, report architect

    report = run.state.report
    assert report.audit.clean
    kinds = [s.kind.value for s in report.sections]
    assert kinds[:3] == ["executive_summary", "case_overview", "legal_developments"]
    assert "data_analysis" not in kinds and "market_reaction" not in kinds
    overview = next(s for s in report.sections if s.kind.value == "case_overview")
    assert overview.blocks[0].citations == ["cl_1"]
    assert "not yet extracted" in report_text(report)


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
    assert llm_calls(run) == 3  # failed attempts still count against the budget


def test_stand_in_calls_are_labelled():
    run = run_once("How has Tesla stock performed?", llm=FakeLLMProvider())
    llm_logs = [e.payload["message"] for e in run.bus.history if e.type == "activity_log" and e.payload["llm_call"]]
    assert all("rule-based stand-in" in m for m in llm_logs)
