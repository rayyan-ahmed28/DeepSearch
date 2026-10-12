"""Shared research state schema for DeepSearch.

Every LangGraph node reads from and appends to a single ResearchState
object as it flows through the graph. Legal and Finance branches run in
parallel, so the list fields carry reducers: a node returns only its NEW
items and LangGraph merges them in (see `merge_by_id`), instead of one
branch overwriting the other's results.
"""

from __future__ import annotations

import operator
from datetime import date, datetime, timezone
from enum import Enum
from typing import Annotated, Any, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


def _new_id() -> str:
    return uuid4().hex[:12]


def merge_by_id(existing: list[Any], new: list[Any]) -> list[Any]:
    """LangGraph reducer: append new items, replacing any with the same id.

    Keeps first-seen order, so retries or both branches reporting the same
    source never create duplicates.
    """
    merged = {item.id: item for item in existing}
    for item in new:
        merged[item.id] = item
    return list(merged.values())


class SourceType(str, Enum):
    """Legal source hierarchy + finance/general equivalents (Section 5/12)."""

    OFFICIAL_COURT = "official_court"
    REGULATORY = "regulatory"
    COMPANY = "company"
    REPUTABLE_NEWS = "reputable_news"
    SECONDARY = "secondary"


class VerificationStatus(str, Enum):
    """Set only by deterministic rules in the Verification node, never by an LLM.

    verified      backed by an official_court or regulatory source (for a
                  company_statement: the company's own filing or release)
    corroborated  two or more sources from independent domains agree
    unverified    no source, or one non-official source
    conflicting   sources disagree on a date or figure; both are shown
    """

    VERIFIED = "verified"
    CORROBORATED = "corroborated"
    UNVERIFIED = "unverified"
    CONFLICTING = "conflicting"


class ClaimType(str, Enum):
    """Legal guardrail taxonomy (Section 13) — never collapse these."""

    ESTABLISHED_FACT = "established_fact"
    ALLEGATION = "allegation"
    PARTY_CLAIM = "party_claim"
    COMPANY_STATEMENT = "company_statement"
    REGULATORY_STATEMENT = "regulatory_statement"
    NEWS_REPORT = "news_report"
    ANALYSIS = "analysis"


class Domain(str, Enum):
    LEGAL = "legal"
    FINANCE = "finance"


class ResearchDepth(str, Enum):
    QUICK = "quick"
    STANDARD = "standard"
    DEEP = "deep"


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class ExecutionStatus(str, Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Source(BaseModel):
    id: str = Field(default_factory=_new_id)
    title: str
    url: str
    source_type: SourceType
    published_date: Optional[date] = None  # often unknown for web pages; show "date unknown"
    retrieved_by: str  # worker name, e.g. "web_research", "legal_records"
    snippet: Optional[str] = None  # evidence excerpt shown in the citation panel


class Claim(BaseModel):
    id: str = Field(default_factory=_new_id)
    text: str
    claim_type: ClaimType
    source_ids: list[str] = Field(default_factory=list)
    verification: VerificationStatus = VerificationStatus.UNVERIFIED
    domain: Optional[Domain] = None  # None = cross-domain (needs Legal and Finance evidence)
    # Structured parts of the claim, so code (not an LLM) can spot conflicts:
    # same claim, different date or figure across sources.
    event_date: Optional[date] = None
    value: Optional[float] = None
    unit: Optional[str] = None  # e.g. "USD", "%", "shares"


class Task(BaseModel):
    id: str = Field(default_factory=_new_id)
    manager: Literal["legal", "finance"]
    worker: str
    description: str
    status: TaskStatus = TaskStatus.PENDING
    error: Optional[str] = None


class FinancialDataPoint(BaseModel):
    ticker: str
    date: date
    close: float
    volume: Optional[int] = None
    # Yahoo Finance closes are split-adjusted, so old prices will not match
    # figures quoted in news from the time (e.g. pre-2020 Tesla). Returns
    # and percentage changes are unaffected.
    split_adjusted: bool = True


class Calculation(BaseModel):
    id: str = Field(default_factory=_new_id)
    description: str
    result: float | dict
    method: str  # e.g. "pandas.pct_change"


class ChartSpec(BaseModel):
    id: str = Field(default_factory=_new_id)
    type: Literal["line", "bar", "timeline"]
    title: str
    data: list[dict]  # Recharts-ready records


class TimelineEvent(BaseModel):
    date: date
    label: str
    description: str
    source_ids: list[str] = Field(default_factory=list)


class ResearchState(BaseModel):
    """The single object threaded through every LangGraph node."""

    research_id: str = Field(default_factory=_new_id)
    user_query: str
    depth: ResearchDepth = ResearchDepth.STANDARD
    mode_override: Optional[Literal["legal", "finance", "legal_finance"]] = None

    detected_domains: list[Domain] = Field(default_factory=list)
    primary_domain: Optional[Domain] = None

    research_plan: dict = Field(default_factory=dict)
    tasks: Annotated[list[Task], merge_by_id] = Field(default_factory=list)

    sources: Annotated[list[Source], merge_by_id] = Field(default_factory=list)
    evidence: Annotated[list[str], operator.add] = Field(default_factory=list)
    claims: Annotated[list[Claim], merge_by_id] = Field(default_factory=list)

    financial_data: Annotated[list[FinancialDataPoint], operator.add] = Field(default_factory=list)
    calculations: Annotated[list[Calculation], merge_by_id] = Field(default_factory=list)
    charts: Annotated[list[ChartSpec], merge_by_id] = Field(default_factory=list)
    timeline: Annotated[list[TimelineEvent], operator.add] = Field(default_factory=list)

    citations: Annotated[list[str], operator.add] = Field(default_factory=list)  # claim/source ids used in the report
    report: Optional[dict] = None

    execution_status: ExecutionStatus = ExecutionStatus.RUNNING
    demo_mode: bool = False
    errors: Annotated[list[str], operator.add] = Field(default_factory=list)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ResearchRequest(BaseModel):
    """Body of POST /api/research."""

    query: str
    mode: Literal["auto", "legal", "finance", "legal_finance"] = "auto"
    depth: ResearchDepth = ResearchDepth.STANDARD


class WSEvent(BaseModel):
    """Shape of every message pushed over WS /ws/research/{id} (Section 8)."""

    type: Literal[
        "domain_classified",
        "plan_created",
        "agent_status",
        "activity_log",
        "source_found",
        "claim_verified",
        "chart_ready",
        "timeline_ready",
        "report_ready",
        "error",
    ]
    payload: dict
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Per-run order, assigned by the event bus. A client that connects late
    # gets the backlog replayed and uses seq to skip events it already has.
    seq: int = 0
