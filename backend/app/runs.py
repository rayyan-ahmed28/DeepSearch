"""Run registry: creates runs, executes the graph in the background, saves them.

Runs in progress live in memory. Every run is also written to SQLite
(app/db/store.py) when it starts and when it ends, so finished runs survive a
restart and can be reopened: their saved events replay like a live run.
"""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass

from app.config import BACKEND_DIR, Settings
from app.db.store import RunStore, sqlite_path
from app.demo.scenarios import RecordedLLMProvider, Scenario, SnapshotPriceSource, load_scenarios
from app.graph.build_graph import build_graph
from app.graph.context import LiveWorkers, RunContext
from app.models.schemas import ExecutionStatus, ResearchRequest, ResearchState, WSEvent
from app.providers import BudgetExceeded, CallCounter, FakeLLMProvider, LLMProvider, build_provider
from app.utils.events import EventBus
from app.workers.court_records import CourtListenerRecords
from app.workers.edgar import EdgarFilings
from app.workers.market_data import PriceSource, YahooPriceSource
from app.workers.web_search import DuckDuckGoSearch, GPTResearcherSearch, TavilySearch, WebSearch

logger = logging.getLogger("deepsearch.runs")

MAX_RUNS_IN_MEMORY = 50
INTERRUPTED = "The server stopped while this run was in progress, so it did not finish."
STOPPED_BY_USER = "You stopped this run. Steps that had not finished were not run."


class UnknownScenario(KeyError):
    pass


class RunInProgress(RuntimeError):
    """The action needs a finished run."""


@dataclass
class Run:
    state: ResearchState
    bus: EventBus
    scenario: Scenario | None = None
    task: asyncio.Task | None = None


def build_live_workers(settings: Settings) -> LiveWorkers:
    """Use what is configured: GPT Researcher needs Gemini; Tavily needs a key; DuckDuckGo needs nothing."""
    web: WebSearch
    if settings.effective_llm == "gemini":
        # GPT Researcher reads its own settings from the environment. Point any it lacks at our Gemini
        # key and model, so GEMINI_API_KEY alone is enough (its packaged default is an xAI model).
        gpt_researcher_env = {
            "RETRIEVER": "tavily" if settings.tavily_api_key else "duckduckgo",
            "GOOGLE_API_KEY": settings.gemini_api_key,
            "FAST_LLM": f"google_genai:{settings.gemini_model}",
            "SMART_LLM": f"google_genai:{settings.gemini_model}",
            "STRATEGIC_LLM": f"google_genai:{settings.gemini_model}",
            "EMBEDDING": "google_genai:models/gemini-embedding-001",
        }
        if settings.tavily_api_key:
            gpt_researcher_env["TAVILY_API_KEY"] = settings.tavily_api_key
        for name, value in gpt_researcher_env.items():
            if not os.environ.get(name, "").strip():  # a blank line in .env counts as unset
                os.environ[name] = value
        # Our LLM_PROVIDER=gemini is also a deprecated GPT Researcher variable: it would replace the
        # FAST/SMART providers above with "gemini", which GPT Researcher rejects (it expects google_genai).
        os.environ.pop("LLM_PROVIDER", None)
        web = GPTResearcherSearch()
    elif settings.tavily_api_key:
        web = TavilySearch(settings.tavily_api_key)
    else:
        web = DuckDuckGoSearch()
    filings = EdgarFilings(settings.sec_edgar_user_agent) if settings.sec_edgar_user_agent else None
    return LiveWorkers(courts=CourtListenerRecords(settings.courtlistener_api_token), web=web, filings=filings)


class RunRegistry:
    def __init__(
        self,
        settings: Settings,
        llm: LLMProvider | None = None,
        prices: PriceSource | None = None,
        live: LiveWorkers | None = None,
        store: RunStore | None = None,
    ) -> None:
        self.settings = settings
        self.store = store or RunStore(sqlite_path(settings.database_url, BACKEND_DIR))
        interrupted = self.store.mark_interrupted()
        if interrupted:
            logger.warning("%d run(s) were in progress when the server last stopped; marked interrupted", interrupted)
        self.llm = llm or build_provider(settings)
        self.fallback_llm = FakeLLMProvider()
        self.prices = prices or YahooPriceSource()
        self.live = live if live is not None else build_live_workers(settings)
        self.graph = build_graph()
        self.scenarios = load_scenarios()
        self.runs: dict[str, Run] = {}

    def get(self, research_id: str) -> Run | None:
        """A run in memory, or a finished one rebuilt from the saved history."""
        run = self.runs.get(research_id)
        if run is not None:
            return run
        loaded = self.store.load(research_id)
        if loaded is None:
            return None
        summary, state, events = loaded
        if state is None:  # interrupted: nothing but its question was saved
            state = ResearchState(
                research_id=research_id, user_query=summary["query"], depth=summary["depth"],
                demo_mode=summary["demo_mode"], execution_status=ExecutionStatus.FAILED, errors=[INTERRUPTED],
            )
            events = [*events, WSEvent(type="error", payload={"message": INTERRUPTED}, seq=len(events) + 1)]
        return Run(state=state, bus=EventBus.replay(events))

    def summary(self, research_id: str) -> dict | None:
        return self.store.summary(research_id)

    def history(self, saved_only: bool = False, limit: int = 50) -> list[dict]:
        return self.store.list(saved_only=saved_only, limit=limit)

    def set_saved(self, research_id: str, saved: bool) -> dict | None:
        summary = self.store.summary(research_id)
        if summary is None:
            return None
        if summary["status"] != "completed":
            raise RunInProgress("Only a finished run with a report can be saved")
        self.store.set_saved(research_id, saved)
        return {**summary, "saved": saved}

    def active_count(self) -> int:
        return sum(1 for run in self.runs.values() if not run.bus.closed)

    def stop(self, research_id: str) -> bool:
        """Stop a run in progress. False if it is unknown or already finished."""
        run = self.runs.get(research_id)
        if run is None or run.bus.closed or run.task is None or run.task.done():
            return False
        run.task.cancel()
        return True

    def delete(self, research_id: str) -> bool:
        run = self.runs.get(research_id)
        if run is not None and not run.bus.closed:
            raise RunInProgress("This run is still in progress")
        self.runs.pop(research_id, None)
        return self.store.delete(research_id)

    def start(self, request: ResearchRequest) -> Run:
        scenario = None
        if request.scenario_id:
            scenario = self.scenarios.get(request.scenario_id)
            if scenario is None:
                raise UnknownScenario(request.scenario_id)
            request = ResearchRequest(query=scenario.query, mode=scenario.mode, depth=scenario.depth)
        state = ResearchState(
            user_query=request.query.strip(),
            depth=request.depth,
            mode_override=None if request.mode == "auto" else request.mode,
            demo_mode=self.settings.demo_mode or scenario is not None,
        )
        run = Run(state=state, bus=EventBus(), scenario=scenario)
        self._forget_oldest_finished()
        self.runs[state.research_id] = run
        self.store.run_started(
            state, request.mode, "recorded" if scenario else self.llm.name,
            scenario.id if scenario else None, scenario.data_as_of.isoformat() if scenario else None,
        )
        run.task = asyncio.create_task(self._execute(run), name=f"run-{state.research_id}")
        return run

    async def _execute(self, run: Run) -> None:
        scenario = run.scenario
        ctx = RunContext(
            research_id=run.state.research_id,
            bus=run.bus,
            llm=RecordedLLMProvider(scenario) if scenario else self.llm,
            fallback_llm=self.fallback_llm,
            counter=CallCounter(self.settings.llm_call_budget),
            prices=SnapshotPriceSource(scenario.prices) if scenario and scenario.prices else self.prices,
            live=LiveWorkers() if scenario else self.live,  # recordings never call live services
            scenario=scenario,
            pace=self.settings.demo_pace_seconds if scenario else 0.0,
        )
        try:
            async for values in self.graph.astream(run.state, config={"configurable": {"ctx": ctx}}, stream_mode="values"):
                run.state = ResearchState.model_validate(values)
            report = run.state.report.model_dump(mode="json") if run.state.report else None
            run.bus.publish("report_ready", {"research_id": run.state.research_id, "report": report})
        except asyncio.CancelledError:  # Stop pressed: end cleanly and keep what was found so far
            for agent in sorted(ctx.running):
                ctx.status(agent, "skipped", "Stopped by you")
            run.state = run.state.model_copy(
                update={"execution_status": ExecutionStatus.STOPPED, "errors": [*run.state.errors, STOPPED_BY_USER]}
            )
            run.bus.publish("error", {"message": STOPPED_BY_USER})
        except Exception as exc:
            reason = str(exc) if isinstance(exc, BudgetExceeded) else f"{type(exc).__name__}: {exc}"
            logger.exception("Run %s failed", run.state.research_id)
            for agent in sorted(ctx.running):
                ctx.status(agent, "error", "Stopped: the run failed")
            run.state = run.state.model_copy(
                update={"execution_status": ExecutionStatus.FAILED, "errors": [*run.state.errors, reason]}
            )
            run.bus.publish("error", {"message": f"The run failed: {reason}"})
        finally:
            run.bus.close()
            try:
                self.store.run_finished(run.state, run.bus.history)
            except Exception:  # saving must never break a run the user is watching
                logger.exception("Could not save run %s", run.state.research_id)

    def _forget_oldest_finished(self) -> None:
        if len(self.runs) < MAX_RUNS_IN_MEMORY:
            return
        for research_id, run in list(self.runs.items()):
            if run.bus.closed:
                del self.runs[research_id]
                return
