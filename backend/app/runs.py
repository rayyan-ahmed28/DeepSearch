"""Run registry: creates runs, executes the graph in the background, keeps results in memory.

Runs live in memory until persistence (SQLite) is added; restarting the server
forgets them, and clients are told so.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from app.config import Settings
from app.demo.scenarios import RecordedLLMProvider, Scenario, SnapshotPriceSource, load_scenarios
from app.graph.build_graph import build_graph
from app.graph.context import RunContext
from app.models.schemas import ExecutionStatus, ResearchRequest, ResearchState
from app.providers import BudgetExceeded, CallCounter, FakeLLMProvider, LLMProvider, build_provider
from app.utils.events import EventBus
from app.workers.market_data import PriceSource, YahooPriceSource

logger = logging.getLogger("deepsearch.runs")

MAX_RUNS_IN_MEMORY = 50


class UnknownScenario(KeyError):
    pass


@dataclass
class Run:
    state: ResearchState
    bus: EventBus
    scenario: Scenario | None = None
    task: asyncio.Task | None = None


class RunRegistry:
    def __init__(self, settings: Settings, llm: LLMProvider | None = None, prices: PriceSource | None = None) -> None:
        self.settings = settings
        self.llm = llm or build_provider(settings)
        self.fallback_llm = FakeLLMProvider()
        self.prices = prices or YahooPriceSource()
        self.graph = build_graph()
        self.scenarios = load_scenarios()
        self.runs: dict[str, Run] = {}

    def get(self, research_id: str) -> Run | None:
        return self.runs.get(research_id)

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
            scenario=scenario,
            pace=self.settings.demo_pace_seconds if scenario else 0.0,
        )
        try:
            async for values in self.graph.astream(run.state, config={"configurable": {"ctx": ctx}}, stream_mode="values"):
                run.state = ResearchState.model_validate(values)
            report = run.state.report.model_dump(mode="json") if run.state.report else None
            run.bus.publish("report_ready", {"research_id": run.state.research_id, "report": report})
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

    def _forget_oldest_finished(self) -> None:
        if len(self.runs) < MAX_RUNS_IN_MEMORY:
            return
        for research_id, run in list(self.runs.items()):
            if run.bus.closed:
                del self.runs[research_id]
                return
