"""Validator for the recorded demo scenarios (decision D21).

Rejects any scenario whose citations don't resolve, whose figures don't come
from its price snapshot, or whose narrative types its own numbers; then
replays each one through the real graph (offline, no pacing) and checks the
report audit and the verification statuses the rules produce.
"""

import asyncio
import re

import pytest

from app.config import Settings
from app.demo.scenarios import PRICE_SOURCE_ID, load_scenarios
from app.models.schemas import Domain, ExecutionStatus, ResearchRequest
from app.runs import RunRegistry
from app.utils.placeholders import PLACEHOLDER, RenderAudit, render
from app.workers.analysis import analyse_prices

SCENARIOS = load_scenarios()
WORKER_DOMAIN = {"legal_records": Domain.LEGAL, "financial_data": Domain.FINANCE, "web_research": None}


def test_the_three_default_scenarios_exist():
    assert set(SCENARIOS) == {"sec_v_musk_2018", "us_v_google_search", "tesla_recent_performance"}


@pytest.mark.parametrize("scenario", SCENARIOS.values(), ids=list(SCENARIOS))
def test_scenario_is_internally_consistent(scenario):
    r = scenario.responses
    domains = set(r.route.domains)
    source_ids = [s.id for s in scenario.sources]
    assert len(source_ids) == len(set(source_ids)), "duplicate source ids"
    known = set(source_ids) | ({PRICE_SOURCE_ID} if scenario.prices else set())

    for source in scenario.sources:
        assert source.url.startswith("https://"), source.id
        assert source.published_date is None or source.published_date <= scenario.data_as_of, source.id
        needed = WORKER_DOMAIN[source.retrieved_by]
        assert needed is None or needed in domains, f"{source.id} comes from a worker that won't run for {domains}"

    # Plans exist exactly for the routed domains.
    assert (r.plan_legal is not None) == (Domain.LEGAL in domains)
    assert (r.plan_finance is not None) == (Domain.FINANCE in domains)
    assert (scenario.prices is not None) == (Domain.FINANCE in domains)

    # Every citation resolves.
    cited = [i for c in r.extract_claims.claims for i in c.source_ids]
    cited += [i for t in scenario.timeline for i in t.source_ids]
    cited += [i for s in r.report.sections for p in s.paragraphs for i in p.source_ids]
    assert set(cited) <= known, f"unresolved citations: {set(cited) - known}"

    # Every figure comes from a calculation the snapshot actually supports.
    calc_ids: set[str] = set()
    if scenario.prices:
        calcs, _ = analyse_prices(scenario.prices.closes, r.plan_finance.events)
        calc_ids = {c.id for c in calcs}
        for event in r.plan_finance.events:
            assert f"ret_{event.id}" in calc_ids, f"snapshot does not cover {event.label}"
    used = set(PLACEHOLDER.findall(" ".join(c.text for c in r.extract_claims.claims)))
    used |= {c.calculation_id for c in r.extract_claims.claims if c.calculation_id}
    used |= set(PLACEHOLDER.findall(" ".join(p.text for s in r.report.sections for p in s.paragraphs)))
    assert used <= calc_ids, f"figures with no calculation: {used - calc_ids}"

    # The narrative never types a number of its own (dates and years are fine).
    audit = RenderAudit()
    for section in r.report.sections:
        for paragraph in section.paragraphs:
            render(paragraph.text, {}, audit)
    assert audit.free_numbers == [], f"numbers typed in the narrative: {audit.free_numbers}"


def replay(scenario_id: str):
    async def scenario():
        registry = RunRegistry(Settings(demo_pace_seconds=0))
        run = registry.start(ResearchRequest(query="ignored", scenario_id=scenario_id))
        await run.task
        return run

    return asyncio.run(scenario())


EXPECTED = {
    "sec_v_musk_2018": {
        "f_alleged": ("allegation", "verified"),
        "f_denial": ("party_claim", "corroborated"),
        "f_concern": ("news_report", "unverified"),
        "f_settlement": ("established_fact", "verified"),
        "f_move_charges": ("established_fact", "verified"),
    },
    "us_v_google_search": {
        "g_alleged": ("allegation", "verified"),
        "g_google_response": ("party_claim", "unverified"),
        "g_no_breakup": ("news_report", "unverified"),
        "g_stay": ("company_statement", "verified"),
        "g_final_judgment": ("established_fact", "verified"),
    },
    "tesla_recent_performance": {
        "t_q2_results": ("news_report", "unverified"),
        "t_q3_deliveries": ("company_statement", "verified"),
        "t_q2_move": ("established_fact", "verified"),
    },
}


@pytest.mark.parametrize("scenario_id", list(SCENARIOS))
def test_scenario_replays_through_the_live_graph(scenario_id):
    run = replay(scenario_id)
    history = run.bus.history
    assert history[-1].type == "report_ready"
    assert run.state.execution_status == ExecutionStatus.COMPLETED

    llm_calls = [e for e in history if e.type == "activity_log" and e.payload["llm_call"]]
    assert 1 <= len(llm_calls) <= 8
    assert all("recorded" in e.payload["message"] for e in llm_calls)
    warnings = [e.payload["message"] for e in history if e.type == "activity_log" and e.payload["level"] != "info"]
    assert warnings == [], warnings

    report = run.state.report
    assert report.llm_provider == "recorded" and report.demo_mode
    assert report.audit.clean, report.audit
    assert not report.audit.sections_dropped
    assert "recorded demo run" in report.sections[[s.kind.value for s in report.sections].index("limitations")].blocks[0].items[0].text

    claims = {c.id: c for c in run.state.claims}
    for claim_id, (claim_type, status) in EXPECTED[scenario_id].items():
        assert (claims[claim_id].claim_type.value, claims[claim_id].verification.value) == (claim_type, status), claim_id
    for claim in claims.values():
        assert "{{calc:" not in claim.text
        assert not re.search(r"\[figure unavailable\]", claim.text)


def test_unknown_scenario_is_rejected():
    async def scenario():
        RunRegistry(Settings(demo_pace_seconds=0)).start(ResearchRequest(query="x", scenario_id="nope"))

    with pytest.raises(KeyError):
        asyncio.run(scenario())
