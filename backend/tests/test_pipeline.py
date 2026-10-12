"""End-to-end runs of the LangGraph pipeline, offline (stand-in LLM, fixture prices)."""

import asyncio

from app.config import Settings
from app.models.schemas import ExecutionStatus, ResearchRequest
from app.providers.base import LLMError
from app.providers.fake import FakeLLMProvider
from app.runs import RunRegistry
from app.utils.placeholders import format_calculation
from tests.fixtures import FailingPrices, FixturePrices


def run_once(query: str, mode: str = "auto", prices=None, llm=None, budget: int = 8):
    async def scenario():
        registry = RunRegistry(Settings(llm_call_budget=budget), llm=llm, prices=prices or FixturePrices())
        run = registry.start(ResearchRequest(query=query, mode=mode))
        await run.task
        return run

    return asyncio.run(scenario())


def types_of(run):
    return [e.type for e in run.bus.history]


def llm_calls(run):
    return sum(1 for e in run.bus.history if e.type == "activity_log" and e.payload["llm_call"])


def test_finance_run_end_to_end():
    run = run_once("How has Tesla stock performed?")
    types = types_of(run)

    assert types[0] == "agent_status" and types[-1] == "report_ready"
    for expected in ("domain_classified", "plan_created", "source_found", "chart_ready"):
        assert expected in types
    assert types.count("calculation_ready") == 3
    seqs = [e.seq for e in run.bus.history]
    assert seqs == list(range(1, len(seqs) + 1))
    assert run.bus.closed

    assert llm_calls(run) == 3  # router, finance manager, report architect
    state = run.state
    assert state.execution_status == ExecutionStatus.COMPLETED
    assert state.research_plan["finance"]["ticker"] == "TSLA"
    assert len(state.financial_data) == 10 and len(state.sources) == 1

    report = state.report
    assert report["audit"]["clean"] is True
    text = " ".join(p for s in report["sections"] for p in s["paragraphs"])
    for calc in state.calculations:
        assert format_calculation(calc) in text  # every figure came from a stored calculation
    assert "{{calc:" not in text and "not investment" in text


def test_manual_domain_choice_skips_router_call():
    run = run_once("How has Tesla stock performed?", mode="finance")
    classified = next(e for e in run.bus.history if e.type == "domain_classified")
    assert classified.payload["domains"] == ["finance"]
    assert "manually" in classified.payload["rationale"]
    assert llm_calls(run) == 2


def test_legal_only_run_reports_the_gap_honestly():
    run = run_once("Latest status of the antitrust case against Example Corp")
    types = types_of(run)
    assert "plan_created" not in types and "chart_ready" not in types
    skipped = {e.payload["agent"]: e.payload.get("detail") for e in run.bus.history
               if e.type == "agent_status" and e.payload["status"] == "skipped"}
    assert "Not built yet" in skipped["legal_manager"]
    assert types[-1] == "report_ready"
    text = " ".join(p for s in run.state.report["sections"] for p in s["paragraphs"])
    assert "not built yet" in text


def test_failed_price_fetch_does_not_crash_the_run():
    prices = FailingPrices()
    run = run_once("How has Tesla stock performed?", prices=prices)
    assert len(prices.calls) == 2  # bounded retries
    statuses = [(e.payload["agent"], e.payload["status"]) for e in run.bus.history if e.type == "agent_status"]
    assert ("financial_data", "error") in statuses
    assert ("calculator", "skipped") in statuses
    assert types_of(run)[-1] == "report_ready"
    assert run.state.execution_status == ExecutionStatus.COMPLETED
    gaps = next(s for s in run.state.report["sections"] if s["heading"] == "What this run did not cover")
    assert any("simulated outage" in p for p in gaps["paragraphs"])


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
