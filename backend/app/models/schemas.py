"""Shared research state schema for DeepSearch.

Every LangGraph node reads from and appends to a single ResearchState
object as it flows through the graph. Nodes should APPEND to the list
fields below (sources, claims, tasks, ...) rather than overwrite them,
since Legal and Finance managers may run in parallel and both
contribute to the same state.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from enum import Enum
from typing import Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


def _new_id() -> str:
    return uuid4().hex[:12]


class SourceType(str, Enum):
    """Legal source hierarchy + finance/general equivalents (Section 5/12)."""

    OFFICIAL_COURT = "official_court"
    REGULATORY = "regulatory"
    COMPANY = "company"
    REPUTABLE_NEWS = "reputable_news"
    SECONDARY = "secondary"


class VerificationStatus(str, Enum):
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
    published_date: Optional[date] = None
    retrieved_by: str  # worker name, e.g. "web_research", "legal_records"


class Claim(BaseModel):
    id: str = Field(default_factory=_new_id)
    text: str
    claim_type: ClaimType
    source_ids: list[str] = Field(default_factory=list)
    verification: VerificationStatus = VerificationStatus.UNVERIFIED


class Task(BaseModel):
    id: str = Field(default_factory=_new_id)
    manager: Literal["legal", "finance"]
    worker: str
    description: str
    status: TaskStatus = TaskStatus.PENDING
    error: Optional[str] = None


class FinancialDataPoint(BaseModel):
    date: date
    close: float
    volume: Optional[int] = None


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
    tasks: list[Task] = Field(default_factory=list)

    sources: list[Source] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    claims: list[Claim] = Field(default_factory=list)

    financial_data: list[FinancialDataPoint] = Field(default_factory=list)
    calculations: list[Calculation] = Field(default_factory=list)
    charts: list[ChartSpec] = Field(default_factory=list)
    timeline: list[TimelineEvent] = Field(default_factory=list)

    citations: list[str] = Field(default_factory=list)  # claim/source ids used in the report
    report: Optional[dict] = None

    execution_status: ExecutionStatus = ExecutionStatus.RUNNING
    demo_mode: bool = False
    errors: list[str] = Field(default_factory=list)

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
        "report_ready",
        "error",
    ]
    payload: dict
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
