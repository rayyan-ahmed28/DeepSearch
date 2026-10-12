"""What every graph node needs for one run: the event bus, the LLM and its budget, workers."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, TypeVar

from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel

from app.providers.base import CallCounter, LLMError, LLMProvider
from app.utils.events import EventBus
from app.workers.market_data import PriceSource

if TYPE_CHECKING:
    from app.demo.scenarios import Scenario

T = TypeVar("T", bound=BaseModel)

# How each provider's calls are labelled in the activity feed.
LLM_LABEL = {
    "fake": " (rule-based stand-in, no Gemini key)",
    "recorded": " (recorded response, Demo Mode)",
}


@dataclass
class RunContext:
    research_id: str
    bus: EventBus
    llm: LLMProvider
    fallback_llm: LLMProvider  # the rule-based stand-in
    counter: CallCounter
    prices: PriceSource
    scenario: Scenario | None = None  # set for recorded demo runs (D21)
    pace: float = 0.0  # seconds per step when replaying a recording, so the run is watchable
    running: set[str] = field(default_factory=set)

    # ── events ─────────────────────────────────────────────────────
    def publish(self, type_: str, payload: dict[str, Any]) -> None:
        self.bus.publish(type_, payload)

    def status(self, agent: str, status: str, detail: str | None = None) -> None:
        if status == "running":
            self.running.add(agent)
        else:
            self.running.discard(agent)
        payload: dict[str, Any] = {"agent": agent, "status": status}
        if detail:
            payload["detail"] = detail
        self.publish("agent_status", payload)

    def log(self, agent: str, message: str, level: str = "info", llm_call: bool = False) -> None:
        self.publish("activity_log", {"agent": agent, "message": message, "level": level, "llm_call": llm_call})

    async def pause(self, factor: float = 1.0) -> None:
        """Replay pacing; a no-op for live runs."""
        if self.pace:
            await asyncio.sleep(self.pace * factor)

    # ── LLM ────────────────────────────────────────────────────────
    async def ask(self, agent: str, purpose: str, message: str, prompt: str, schema: type[T], context: dict[str, Any]) -> T:
        """One counted LLM call. If Gemini fails, fall back to the rule-based stand-in (and say so)."""
        self.counter.take()
        self.log(agent, message + LLM_LABEL.get(self.llm.name, ""), llm_call=True)
        try:
            return await self.llm.generate(purpose, prompt, schema, context)
        except LLMError as exc:
            if self.llm.name != "gemini":
                raise  # the stand-in and recordings have nothing to fall back to
            self.log(agent, f"{exc}; used the rule-based fallback instead", level="warn")
            return await self.fallback_llm.generate(purpose, prompt, schema, context)


def get_ctx(config: RunnableConfig) -> RunContext:
    return config["configurable"]["ctx"]
