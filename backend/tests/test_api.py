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

    entry = client.get(f"/api/research/{research_id}").json()
    assert entry["status"] == "completed" and entry["saved"] is False and entry["llm_provider"] == "fake"
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


# ── saved history (Phase 7) ────────────────────────────────────────
def server(db_path):
    """A fresh server process, as after a restart: same database file, empty memory."""
    settings = Settings(demo_pace_seconds=0, database_url=f"sqlite:///{db_path}")
    return TestClient(create_app(settings, llm=FakeLLMProvider(), prices=FixturePrices(), live=offline_live()))


def test_finished_runs_survive_a_restart(tmp_path):
    db = tmp_path / "history.db"
    with server(db) as first:
        research_id = first.post("/api/research", json={"query": "How has Tesla stock performed?"}).json()["research_id"]
        with first.websocket_connect(f"/ws/research/{research_id}") as ws:
            original = collect(ws)
        first.app.state.registry.store.close()

    with server(db) as second:
        history = second.get("/api/research").json()
        assert [h["research_id"] for h in history] == [research_id]
        entry = history[0]
        assert entry["status"] == "completed" and entry["domains"] == ["finance"]
        assert entry["title"] and entry["source_count"] > 0 and entry["claim_count"] > 0
        # The saved events replay exactly, so every screen rebuilds as it was.
        with second.websocket_connect(f"/ws/research/{research_id}") as ws:
            assert collect(ws) == original
        assert second.get(f"/api/research/{research_id}/report").json()["audit"]["clean"] is True


def test_save_unsave_and_delete(tmp_path):
    with server(tmp_path / "h.db") as client:
        research_id = client.post("/api/research", json={"query": "How has Tesla stock performed?"}).json()["research_id"]
        with client.websocket_connect(f"/ws/research/{research_id}") as ws:
            collect(ws)
        assert client.get("/api/research?saved=true").json() == []
        assert client.patch(f"/api/research/{research_id}", json={"saved": True}).json()["saved"] is True
        assert [h["research_id"] for h in client.get("/api/research?saved=true").json()] == [research_id]
        client.patch(f"/api/research/{research_id}", json={"saved": False})
        assert client.get("/api/research?saved=true").json() == []

        assert client.delete(f"/api/research/{research_id}").status_code == 204
        assert client.get(f"/api/research/{research_id}").status_code == 404
        assert client.get("/api/research").json() == []
        assert client.delete(f"/api/research/{research_id}").status_code == 404
        assert client.patch("/api/research/nope", json={"saved": True}).status_code == 404


def test_a_run_cut_off_by_a_restart_is_reported_not_lost(tmp_path):
    from app.db.store import RunStore, sqlite_path
    from app.models.schemas import ResearchState

    db = tmp_path / "h.db"
    store = RunStore(sqlite_path(f"sqlite:///{db}", tmp_path))
    store.run_started(ResearchState(research_id="cut0ff", user_query="Was this saved?"), "auto", "fake")
    store.close()

    with server(db) as client:
        entry = client.get("/api/research/cut0ff").json()
        assert entry["status"] == "interrupted" and entry["query"] == "Was this saved?"
        with client.websocket_connect("/ws/research/cut0ff") as ws:
            events = collect(ws)
        assert [e["type"] for e in events] == ["error"] and "server stopped" in events[0]["payload"]["message"]
        assert client.patch("/api/research/cut0ff", json={"saved": True}).status_code == 409  # no report to save
        assert client.delete("/api/research/cut0ff").status_code == 204


def test_database_path_resolves_next_to_the_backend(tmp_path):
    from app.db.store import sqlite_path

    assert sqlite_path(":memory:", tmp_path) == ":memory:"
    assert sqlite_path("sqlite:///./deepsearch.db", tmp_path) == str((tmp_path / "deepsearch.db").resolve())
