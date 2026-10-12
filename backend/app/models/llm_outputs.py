"""Structured outputs the LLM agents must return (validated with Pydantic).

Gemini is asked for JSON matching these models; the rule-based stand-in and
recorded demo runs build the same models directly. Agents never accept free text.
"""

from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.models.schemas import ClaimType, Domain


class RouterDecision(BaseModel):
    """Gateway Router: which domains apply and how hard the question is."""

    domains: list[Domain] = Field(min_length=1)
    primary_domain: Domain
    complexity: Literal["low", "standard", "high"]
    rationale: str


class LegalPlan(BaseModel):
    """Legal Manager: what to look for. It never states findings."""

    case_name: Optional[str] = None
    court_query: Optional[str] = None  # what Legal Records searches CourtListener for
    search_queries: list[str] = Field(default_factory=list)  # what Web Research searches for
    tasks: list[str]
    rationale: str


class EventWindow(BaseModel):
    """A dated event whose share-price reaction the Data Analysis worker should measure."""

    id: str = Field(pattern=r"^[a-z0-9_]+$")  # the calculation becomes ret_<id>
    date: date
    label: str


class FinancePlan(BaseModel):
    """Finance Manager: what to fetch and compute. It never produces numbers."""

    company: Optional[str] = None
    ticker: Optional[str] = None  # US-listed symbol, e.g. "TSLA"; None if the query names none
    period: Literal["3mo", "6mo", "1y", "2y"] = "6mo"
    events: list[EventWindow] = Field(default_factory=list)
    tasks: list[str]
    rationale: str


class ExtractedClaim(BaseModel):
    """A claim pulled from the sources by Verification's LLM call (D19).

    There is deliberately no verification field: status is set by rules, never
    by the LLM. A figure in the text must be a {{calc:<id>}} placeholder.
    """

    id: str
    text: str
    claim_type: ClaimType
    source_ids: list[str] = Field(default_factory=list)
    domain: Optional[Domain] = None
    event_date: Optional[date] = None
    calculation_id: Optional[str] = None  # the stored calculation this claim's figure comes from
    # Claims about the same fact from different sources share a subject (e.g. "settlement_date"),
    # so code can spot sources that disagree on the date or figure.
    subject: Optional[str] = None


class ClaimExtraction(BaseModel):
    claims: list[ExtractedClaim]


NarrativeKind = Literal[
    "executive_summary", "case_overview", "legal_developments", "financial_impact", "market_reaction", "risk_factors"
]


class DraftParagraph(BaseModel):
    # Figures appear only as {{calc:<id>}} placeholders, filled in by code (D20).
    text: str
    source_ids: list[str] = Field(default_factory=list)  # ids of the sources this paragraph relies on


class DraftSection(BaseModel):
    kind: NarrativeKind
    heading: str
    paragraphs: list[DraftParagraph] = Field(min_length=1)


class ReportDraft(BaseModel):
    """Report Architect output: narrative sections only.

    Code adds key findings, data tables, the timeline, limitations, sources and
    the disclaimer, and drops any section that does not fit the run's domains.
    """

    title: str
    sections: list[DraftSection] = Field(min_length=1)
