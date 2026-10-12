"""HTTP and WebSocket API, offline (stand-in LLM, fixture prices)."""

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.config import Settings
from app.main import create_app
from app.providers.fake import FakeLLMProvider
from tests.fixtures import FixturePrices, offline_live


@pytest.fixture
def client():
    settings = Settings(gemini_api_key="", tavily_api_key="secret-tavily-value", demo_pace_seconds=0)
    app = create_app(settings, llm=FakeLLMProvider(), prices=FixturePrices(), live=offline_live())
    with TestClient(app) as c:
        yield c


def collect(ws) -> list[dict]:
    events = []
    while True:
        try:
            events.append(ws.receive_json())
        except WebSocketDisconnect:
            return events


def test_health_reports_configuration_without_secrets(client):
    body = client.get("/api/health").json()
    assert body["demo_mode"] is True and body["llm_provider"] == "fake"
    assert body["providers"] == {"gemini": False, "tavily": True, "courtlistener": False}
    assert "secret-tavily-value" not in str(body)


def test_research_run_over_websocket(client):
    created = client.post("/api/research", json={"query": "How has Tesla stock performed?", "mode": "auto"})
    assert created.status_code == 201
    research_id = created.json()["research_id"]

    with client.websocket_connect(f"/ws/research/{research_id}") as ws:
        events = collect(ws)
    assert events[-1]["type"] == "report_ready"
    assert [e["seq"] for e in events] == list(range(1, len(events) + 1))

    # Reconnecting with ?after= replays only what the client is missing.
    with client.websocket_connect(f"/ws/research/{research_id}?after={len(events) - 2}") as ws:
        tail = collect(ws)
    assert [e["seq"] for e in tail] == [len(events) - 1, len(events)]

    assert client.get(f"/api/research/{research_id}").json()["execution_status"] == "completed"
    report = client.get(f"/api/research/{research_id}/report").json()
    assert report["audit"]["clean"] is True and report["sections"]


def test_unknown_run(client):
    assert client.get("/api/research/nope").status_code == 404
    with client.websocket_connect("/ws/research/nope") as ws:
        event = ws.receive_json()
        assert event["type"] == "error"
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == 4404


def test_demo_scenarios_list_and_replay(client):
    listed = client.get("/api/demo/scenarios").json()
    assert {s["id"] for s in listed} == {"sec_v_musk_2018", "us_v_google_search", "tesla_recent_performance"}
    flagship = next(s for s in listed if s["id"] == "sec_v_musk_2018")
    assert flagship["domains"] == ["legal", "finance"] and flagship["data_as_of"] == "2026-10-12"

    created = client.post("/api/research", json={"query": flagship["query"], "scenario_id": "sec_v_musk_2018"}).json()
    assert created["llm_provider"] == "recorded"
    assert created["scenario"] == {"id": "sec_v_musk_2018", "data_as_of": "2026-10-12"}
    with client.websocket_connect(f"/ws/research/{created['research_id']}") as ws:
        events = collect(ws)
    assert events[-1]["type"] == "report_ready"
    assert events[-1]["payload"]["report"]["audit"]["clean"] is True

    missing = client.post("/api/research", json={"query": "x", "scenario_id": "nope"})
    assert missing.status_code == 404


def test_request_validation(client):
    assert client.post("/api/research", json={"query": ""}).status_code == 422
    assert client.post("/api/research", json={"query": "x" * 2001}).status_code == 422
    assert client.post("/api/research", json={"query": "ok", "mode": "sports"}).status_code == 422
