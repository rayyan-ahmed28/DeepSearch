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


class ReportSection(BaseModel):
    heading: str
    # Figures appear only as {{calc:<id>}} placeholders, filled in by code (D20).
    paragraphs: list[str]


class ReportDraft(BaseModel):
    """Report Architect output before placeholders are filled and audited."""

    title: str
    sections: list[ReportSection] = Field(min_length=1)
