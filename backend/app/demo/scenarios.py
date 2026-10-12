"""Recorded demo scenarios (decision D21).

A scenario holds what a live run gathered on a given date: the sources (real,
with checked URLs), a price snapshot from Yahoo Finance, and every LLM response
(routing, plans, claim extraction, report draft). Replaying it runs the SAME
graph as a live run: the Data Analysis worker recomputes every figure from the
snapshot, the Verification rules recompute every status, and the report
builder re-audits the report. Only the external calls are replayed.

Scenario files live in app/demo/scenarios/*.json; tests/test_scenarios.py
rejects any file whose citations don't resolve or whose figures don't match
the price data.
"""

from __future__ import annotations

from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, Optional, TypeVar

from pydantic import BaseModel, Field

from app.models.llm_outputs import ClaimExtraction, FinancePlan, LegalPlan, ReportDraft, RouterDecision
from app.models.schemas import FinancialDataPoint, ResearchDepth, Source, SourceType, TimelineEvent
from app.providers.base import LLMError
from app.workers.market_data import MarketDataError

SCENARIO_DIR = Path(__file__).resolve().parent / "scenarios"
PRICE_SOURCE_ID = "src_prices"

T = TypeVar("T", bound=BaseModel)


class PriceSnapshot(BaseModel):
    ticker: str
    snapshot_taken: date  # when scripts/snapshot_prices.py fetched it
    closes: list[FinancialDataPoint]


class RecordedResponses(BaseModel):
    route: RouterDecision
    plan_legal: Optional[LegalPlan] = None
    plan_finance: Optional[FinancePlan] = None
    extract_claims: ClaimExtraction
    report: ReportDraft


class Scenario(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_]+$")
    title: str
    description: str
    query: str
    mode: Literal["auto", "legal", "finance", "legal_finance"] = "auto"
    depth: ResearchDepth = ResearchDepth.STANDARD
    data_as_of: date  # when the sources were gathered and checked
    sources: list[Source]
    timeline: list[TimelineEvent] = Field(default_factory=list)
    prices: Optional[PriceSnapshot] = None
    responses: RecordedResponses


@lru_cache(maxsize=1)
def load_scenarios() -> dict[str, Scenario]:
    scenarios = [Scenario.model_validate_json(p.read_text(encoding="utf-8")) for p in sorted(SCENARIO_DIR.glob("*.json"))]
    return {s.id: s for s in scenarios}


class RecordedLLMProvider:
    """Answers each LLM call with the response recorded for this scenario."""

    name = "recorded"

    def __init__(self, scenario: Scenario) -> None:
        self._responses = scenario.responses

    async def generate(self, purpose: str, prompt: str, schema: type[T], context: dict[str, Any]) -> T:
        value = getattr(self._responses, purpose, None)
        if not isinstance(value, schema):
            raise LLMError(f"No recorded response for '{purpose}' in this scenario")
        return value


class SnapshotPriceSource:
    """Serves the scenario's Yahoo Finance snapshot instead of fetching live."""

    def __init__(self, snapshot: PriceSnapshot) -> None:
        self.snapshot = snapshot
        self.name = f"a Yahoo Finance snapshot taken {snapshot.snapshot_taken}"

    def history(self, ticker: str, period: str) -> list[FinancialDataPoint]:
        if ticker != self.snapshot.ticker:
            raise MarketDataError(f"The snapshot holds {self.snapshot.ticker}, not {ticker}")
        return list(self.snapshot.closes)

    def source_for(self, ticker: str, points: list[FinancialDataPoint]) -> Source:
        return Source(
            id=PRICE_SOURCE_ID,
            title=f"{ticker} daily price history (Yahoo Finance, snapshot taken {self.snapshot.snapshot_taken})",
            url=f"https://finance.yahoo.com/quote/{ticker}/history",
            source_type=SourceType.SECONDARY,
            published_date=self.snapshot.snapshot_taken,
            retrieved_by="financial_data",
            snippet=f"{len(points)} daily closes from {points[0].date} to {points[-1].date}, split-adjusted.",
        )
