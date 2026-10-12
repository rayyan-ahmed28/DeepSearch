"""Structured outputs the LLM agents must return (validated with Pydantic).

Gemini is asked for JSON matching these models; the rule-based stand-in
builds the same models directly. Agents never accept free text.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.models.schemas import Domain


class RouterDecision(BaseModel):
    """Gateway Router: which domains apply and how hard the question is."""

    domains: list[Domain] = Field(min_length=1)
    primary_domain: Domain
    complexity: Literal["low", "standard", "high"]
    rationale: str


class FinancePlan(BaseModel):
    """Finance Manager: what to fetch and compute. It never produces numbers."""

    company: Optional[str] = None
    ticker: Optional[str] = None  # US-listed symbol, e.g. "TSLA"; None if the query names none
    period: Literal["3mo", "6mo", "1y", "2y"] = "6mo"
    tasks: list[str]
    rationale: str


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
