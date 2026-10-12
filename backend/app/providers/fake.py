"""Rule-based stand-in for the LLM, used when no Gemini key is configured.

It returns the same structured outputs as Gemini, built with plain rules, so
the whole pipeline runs with zero keys (Demo Mode). The UI labels these calls
as a stand-in; it never pretends to be a model.
"""

from __future__ import annotations

import re
from typing import Any, TypeVar

from pydantic import BaseModel

from app.models.llm_outputs import FinancePlan, ReportDraft, ReportSection, RouterDecision
from app.models.schemas import Domain
from app.providers.base import LLMError

T = TypeVar("T", bound=BaseModel)

LEGAL_TERMS = (
    "lawsuit", "suit", "sued", "court", "case", "litigation", "legal", "antitrust", "regulator",
    "settlement", "ruling", "judge", "complaint", "verdict", "fine", "injunction", "docket",
    "allegation", "alleged", "charged", "sec action", "doj", "ftc",
)
FINANCE_TERMS = (
    "stock", "share", "price", "market", "earnings", "revenue", "return", "valuation", "investor",
    "financial", "profit", "volatility", "ticker", "performance", "dividend", "$",
)

# Common US-listed companies, for when the query names a company instead of a ticker.
KNOWN_TICKERS = {
    "tesla": "TSLA", "apple": "AAPL", "microsoft": "MSFT", "alphabet": "GOOGL", "google": "GOOGL",
    "amazon": "AMZN", "nvidia": "NVDA", "meta": "META", "facebook": "META", "netflix": "NFLX",
    "intel": "INTC", "amd": "AMD", "boeing": "BA", "disney": "DIS", "walmart": "WMT",
    "jpmorgan": "JPM", "jp morgan": "JPM", "goldman sachs": "GS", "bank of america": "BAC",
    "coca-cola": "KO", "coca cola": "KO", "pfizer": "PFE", "exxon": "XOM", "uber": "UBER",
    "airbnb": "ABNB", "salesforce": "CRM", "oracle": "ORCL", "ibm": "IBM", "infosys": "INFY",
    "berkshire hathaway": "BRK-B",
}

# Only explicit ticker forms, so words like "SEC" or "CEO" are never mistaken for symbols.
TICKER_PATTERNS = (
    re.compile(r"\$([A-Z]{1,5}(?:[.-][A-Z])?)\b"),
    re.compile(r"\(([A-Z]{1,5}(?:[.-][A-Z])?)\)"),
    re.compile(r"\b(?:ticker|symbol|NASDAQ|NYSE)[:\s]+([A-Z]{1,5}(?:[.-][A-Z])?)\b"),
)

PERIOD_LABEL = {"3mo": "three months", "6mo": "six months", "1y": "year", "2y": "two years"}


def _matches(text: str, terms: tuple[str, ...]) -> list[str]:
    lowered = text.lower()
    return [t for t in terms if (t in lowered if not t.isalpha() else re.search(rf"\b{re.escape(t)}", lowered))]


def find_ticker(query: str) -> tuple[str | None, str | None]:
    """(company, ticker) from explicit ticker syntax or a known company name."""
    for pattern in TICKER_PATTERNS:
        m = pattern.search(query)
        if m:
            return None, m.group(1)
    lowered = query.lower()
    for name, ticker in KNOWN_TICKERS.items():
        if re.search(rf"\b{re.escape(name)}\b", lowered):
            return name.title(), ticker
    return None, None


class FakeLLMProvider:
    name = "fake"

    async def generate(self, purpose: str, prompt: str, schema: type[T], context: dict[str, Any]) -> T:
        handler = {
            "route": self._route,
            "plan_finance": self._plan_finance,
            "report": self._report,
        }.get(purpose)
        if handler is None:
            raise LLMError(f"The rule-based stand-in has no handler for '{purpose}'")
        result = handler(context)
        if not isinstance(result, schema):
            raise LLMError(f"Stand-in produced {type(result).__name__}, expected {schema.__name__}")
        return result

    # ── handlers ───────────────────────────────────────────────────
    def _route(self, ctx: dict[str, Any]) -> RouterDecision:
        query = ctx["query"]
        legal = _matches(query, LEGAL_TERMS)
        finance = _matches(query, FINANCE_TERMS)
        if legal and finance:
            domains = [Domain.LEGAL, Domain.FINANCE] if len(legal) >= len(finance) else [Domain.FINANCE, Domain.LEGAL]
        elif legal:
            domains = [Domain.LEGAL]
        elif finance:
            domains = [Domain.FINANCE]
        else:
            domains = [Domain.FINANCE, Domain.LEGAL]  # nothing matched: cover both rather than guess
        found = ", ".join((legal + finance)[:6]) or "no domain keywords"
        return RouterDecision(
            domains=domains,
            primary_domain=domains[0],
            complexity="high" if len(domains) == 2 else "standard",
            rationale=f"Keyword rules (no Gemini key): matched {found}.",
        )

    def _plan_finance(self, ctx: dict[str, Any]) -> FinancePlan:
        company, ticker = find_ticker(ctx["query"])
        period = ctx["period"]
        if ticker:
            tasks = [
                f"Fetch daily price history for {ticker} ({PERIOD_LABEL[period]})",
                "Compute period return, volatility and maximum drawdown with pandas",
                "Prepare a price chart",
            ]
            rationale = f"Identified {company or ticker} ({ticker}) in the query."
        else:
            tasks = ["Identify the company or ticker (none found in the query)"]
            rationale = "No company or ticker found; name one or add a symbol such as $TSLA."
        return FinancePlan(company=company, ticker=ticker, period=period, tasks=tasks, rationale=rationale)

    def _report(self, ctx: dict[str, Any]) -> ReportDraft:
        ticker = ctx.get("ticker")
        name = ctx.get("company") or ticker
        calc_ids = {c["id"] for c in ctx.get("calculations", [])}
        sections: list[ReportSection] = []

        if ticker and "ret_period" in calc_ids:
            summary = [
                f"{name} ({ticker}) returned {{{{calc:ret_period}}}} between {ctx['period_start']} and "
                f"{ctx['period_end']}, measured from daily closing prices."
            ]
            market = [
                "Annualised volatility of daily returns was {{calc:vol_annual}}.",
                "The largest peak-to-trough fall in the period (maximum drawdown) was {{calc:dd_max}}.",
                "Prices are split-adjusted daily closes from Yahoo Finance; every figure was computed in code from that series.",
            ]
            sections += [ReportSection(heading="Summary", paragraphs=summary),
                         ReportSection(heading="Market data", paragraphs=market)]
        elif "finance" in ctx.get("domains", []):
            sections.append(ReportSection(
                heading="Summary",
                paragraphs=["No price data was available for this query, so the report contains no figures."],
            ))
        else:
            sections.append(ReportSection(
                heading="Summary",
                paragraphs=["This question is legal-only. Legal research is not built yet in this version, so there are no findings to report."],
            ))

        gaps = ctx.get("gaps") or []
        if gaps:
            sections.append(ReportSection(heading="What this run did not cover", paragraphs=gaps))
        sections.append(ReportSection(
            heading="Important",
            paragraphs=["This is research information, not investment or legal advice. Past price movements do not predict future returns."],
        ))
        title = f"{name}: price performance over the last {PERIOD_LABEL.get(ctx.get('period', ''), 'period')}" if ticker else "Research summary"
        return ReportDraft(title=title, sections=sections)
