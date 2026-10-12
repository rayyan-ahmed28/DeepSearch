"""Saved research history in SQLite (Python's built-in sqlite3, no ORM).

One row per run. A row is written when the run starts and again when it
finishes, with the run's full event history and final state, so any past run
can be reopened after a restart: its events replay over the same WebSocket
as a live run. A run the server was still working on when it stopped is
marked "interrupted" at the next start-up.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.models.schemas import ResearchState, WSEvent

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    research_id  TEXT PRIMARY KEY,
    query        TEXT NOT NULL,
    mode         TEXT NOT NULL,
    depth        TEXT NOT NULL,
    status       TEXT NOT NULL,            -- running | completed | failed | stopped | interrupted
    created_at   TEXT NOT NULL,
    finished_at  TEXT,
    llm_provider TEXT NOT NULL,            -- gemini | fake | recorded
    demo_mode    INTEGER NOT NULL,
    scenario_id  TEXT,
    data_as_of   TEXT,
    title        TEXT,
    domains      TEXT NOT NULL DEFAULT '[]',
    source_count INTEGER NOT NULL DEFAULT 0,
    claim_count  INTEGER NOT NULL DEFAULT 0,
    saved        INTEGER NOT NULL DEFAULT 0,
    state_json   TEXT,
    events_json  TEXT
);
CREATE INDEX IF NOT EXISTS runs_created ON runs (created_at DESC);
"""

SUMMARY_COLUMNS = (
    "research_id, query, mode, depth, status, created_at, finished_at, llm_provider, demo_mode, "
    "scenario_id, data_as_of, title, domains, source_count, claim_count, saved"
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sqlite_path(database_url: str, base_dir: Path) -> str:
    """'sqlite:///./deepsearch.db' -> <base_dir>/deepsearch.db; ':memory:' stays in memory."""
    path = database_url.removeprefix("sqlite:///").removeprefix("sqlite://")
    if path in ("", ":memory:"):
        return ":memory:"
    p = Path(path)
    return str(p if p.is_absolute() else (base_dir / p).resolve())


class RunStore:
    def __init__(self, path: str = ":memory:") -> None:
        self.path = path
        # One connection shared by the server's threads; the lock keeps writes in order.
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock, self._db:
            self._db.executescript(SCHEMA)

    # ── writes ─────────────────────────────────────────────────────
    def run_started(self, state: ResearchState, mode: str, llm_provider: str,
                    scenario_id: str | None = None, data_as_of: str | None = None) -> None:
        with self._lock, self._db:
            self._db.execute(
                "INSERT OR REPLACE INTO runs (research_id, query, mode, depth, status, created_at, llm_provider, "
                "demo_mode, scenario_id, data_as_of) VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?, ?)",
                (state.research_id, state.user_query, mode, state.depth.value, state.created_at.isoformat(),
                 llm_provider, int(state.demo_mode), scenario_id, data_as_of),
            )

    def run_finished(self, state: ResearchState, events: list[WSEvent]) -> None:
        status = state.execution_status.value
        with self._lock, self._db:
            self._db.execute(
                "UPDATE runs SET status = ?, finished_at = ?, title = ?, domains = ?, source_count = ?, "
                "claim_count = ?, state_json = ?, events_json = ? WHERE research_id = ?",
                (status, _now(), state.report.title if state.report else None,
                 json.dumps([d.value for d in state.detected_domains]), len(state.sources), len(state.claims),
                 state.model_dump_json(), json.dumps([e.model_dump(mode="json") for e in events]), state.research_id),
            )

    def mark_interrupted(self) -> int:
        """Runs still marked running belong to a server that stopped; returns how many were found."""
        with self._lock, self._db:
            return self._db.execute(
                "UPDATE runs SET status = 'interrupted', finished_at = ? WHERE status = 'running'", (_now(),)
            ).rowcount

    def set_saved(self, research_id: str, saved: bool) -> bool:
        with self._lock, self._db:
            return self._db.execute(
                "UPDATE runs SET saved = ? WHERE research_id = ?", (int(saved), research_id)
            ).rowcount == 1

    def delete(self, research_id: str) -> bool:
        with self._lock, self._db:
            return self._db.execute("DELETE FROM runs WHERE research_id = ?", (research_id,)).rowcount == 1

    # ── reads ──────────────────────────────────────────────────────
    def summary(self, research_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._db.execute(f"SELECT {SUMMARY_COLUMNS} FROM runs WHERE research_id = ?", (research_id,)).fetchone()
        return _summary(row) if row else None

    def count(self) -> int:
        with self._lock:
            return self._db.execute("SELECT COUNT(*) FROM runs").fetchone()[0]

    def list(self, saved_only: bool = False, limit: int = 50) -> list[dict[str, Any]]:
        where = "WHERE saved = 1" if saved_only else ""
        with self._lock:
            rows = self._db.execute(
                f"SELECT {SUMMARY_COLUMNS} FROM runs {where} ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [_summary(r) for r in rows]

    def load(self, research_id: str) -> tuple[dict[str, Any], ResearchState | None, list[WSEvent]] | None:
        """(summary, final state, events) for a stored run; state is None for an interrupted run."""
        with self._lock:
            row = self._db.execute(
                f"SELECT {SUMMARY_COLUMNS}, state_json, events_json FROM runs WHERE research_id = ?", (research_id,)
            ).fetchone()
        if row is None:
            return None
        state = ResearchState.model_validate_json(row["state_json"]) if row["state_json"] else None
        events = [WSEvent.model_validate(e) for e in json.loads(row["events_json"])] if row["events_json"] else []
        return _summary(row), state, events

    def close(self) -> None:
        self._db.close()


def _summary(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "research_id": row["research_id"],
        "query": row["query"],
        "mode": row["mode"],
        "depth": row["depth"],
        "status": row["status"],
        "created_at": row["created_at"],
        "finished_at": row["finished_at"],
        "llm_provider": row["llm_provider"],
        "demo_mode": bool(row["demo_mode"]),
        "scenario": {"id": row["scenario_id"], "data_as_of": row["data_as_of"]} if row["scenario_id"] else None,
        "title": row["title"],
        "domains": json.loads(row["domains"]),
        "source_count": row["source_count"],
        "claim_count": row["claim_count"],
        "saved": bool(row["saved"]),
    }
