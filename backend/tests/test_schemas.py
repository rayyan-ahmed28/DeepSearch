"""Smoke tests for the shared research state schema.

No network, no LLM, no external services — these must always pass,
including with zero API keys configured (this is the foundation the
Demo Mode smoke test in Section 20 builds on).
"""

from app.models.schemas import (
    Claim,
    ClaimType,
    Domain,
    ResearchRequest,
    ResearchState,
    Source,
    SourceType,
    WSEvent,
)


def test_research_state_defaults():
    state = ResearchState(user_query="test query")
    assert state.research_id
    assert state.execution_status.value == "running"
    assert state.demo_mode is False
    assert state.sources == []
    assert state.claims == []


def test_sources_and_claims_are_additive():
    state = ResearchState(user_query="How could a lawsuit against Nvidia affect its stock price?")
    state.detected_domains = [Domain.FINANCE, Domain.LEGAL]

    src = Source(
        title="SEC Litigation Release",
        url="https://www.sec.gov/litigation/litreleases/example",
        source_type=SourceType.REGULATORY,
        retrieved_by="legal_records",
    )
    state.sources.append(src)

    claim = Claim(
        text="The SEC alleges the company misled investors.",
        claim_type=ClaimType.ALLEGATION,
        source_ids=[src.id],
    )
    state.claims.append(claim)

    assert len(state.sources) == 1
    assert len(state.claims) == 1
    # Guardrail check: an allegation must never silently become a fact
    assert state.claims[0].claim_type == ClaimType.ALLEGATION


def test_research_request_parses_mode_and_depth():
    req = ResearchRequest(query="test", mode="legal_finance", depth="deep")
    assert req.mode == "legal_finance"
    assert req.depth.value == "deep"


def test_ws_event_shape():
    evt = WSEvent(type="agent_status", payload={"agent": "finance_manager", "status": "running"})
    assert evt.type == "agent_status"
    assert evt.payload["agent"] == "finance_manager"


def test_state_round_trips_to_json():
    state = ResearchState(user_query="test")
    dumped = state.model_dump_json()
    assert isinstance(dumped, str)
    assert "research_id" in dumped
