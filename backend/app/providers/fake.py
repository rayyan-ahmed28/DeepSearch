"""Rule-based stand-in for the LLM, used when no Gemini key is configured.

It returns the same structured outputs as Gemini, built with plain rules, so
the whole pipeline runs with zero keys (Demo Mode). The UI labels these calls
as a stand-in; it never pretends to be a model.
"""

from __future__ import annotations

import re
from typing import Any, TypeVar

from pydantic import BaseModel

from app.models.llm_outputs import DraftParagraph, DraftSection, FinancePlan, LegalPlan, ReportDraft, RouterDecision
from app.models.schemas import Domain
from app.providers.base import LLMError

T = TypeVar("T", bound=BaseModel)

LEGAL_TERMS = (
    "lawsuit", "suit", "sued", "court", "case", "litigation", "legal", "antitrust", "regulator",
    "settlement", "ruling", "judge", "complaint", "verdict", "fine", "injunction", "docket",
    "allegation", "alleged", "charged", "sec action", "doj", "ftc", "fraud", "securities fraud", "patent",
    "bankruptcy", "appeal",
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

# A time frame named in the question wins over the depth default.
PERIOD_PATTERNS = (
    ("2y", re.compile(r"\b(?:two|2)[ -]years?\b|\b24 months\b")),
    ("1y", re.compile(r"\b(?:last|past|this|one|1)[ -]year\b|\b12 months\b|\bytd\b|\byear to date\b")),
    ("6mo", re.compile(r"\b(?:six|6)[ -]months?\b|\bhalf[ -]year\b")),
    ("3mo", re.compile(r"\b(?:three|3)[ -]months?\b|\bquarter\b")),
)


def find_period(query: str) -> str | None:
    lowered = query.lower()
    for period, pattern in PERIOD_PATTERNS:
        if pattern.search(lowered):
            return period
    return None


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
            "plan_legal": self._plan_legal,
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

    def _plan_legal(self, ctx: dict[str, Any]) -> LegalPlan:
        query = ctx["query"]
        case_name = find_case_name(query)
        court_query = legal_keywords(query)  # parties plus the subject: a case name alone matches thousands of warrants
        searches = list(dict.fromkeys([query.strip().rstrip("?"), f"{court_query} court ruling"]))
        return LegalPlan(
            case_name=case_name,
            court_query=court_query,
            search_queries=searches,
            tasks=[
                f"Search federal court dockets for '{court_query}'",
                "Search official sites and reputable news for the latest developments",
                "Collect dated sources for a case timeline",
            ],
            rationale=(f"Identified the case {case_name}." if case_name else f"No case name given; searching for '{court_query}'."),
        )

    def _plan_finance(self, ctx: dict[str, Any]) -> FinancePlan:
        company, ticker = find_ticker(ctx["query"])
        period = find_period(ctx["query"]) or ctx["period"]
        if ticker:
            tasks = [
                f"Fetch daily price history for {ticker} ({PERIOD_LABEL[period]})",
                "Pull the company's recent SEC filings",
                "Compute period return, volatility, maximum drawdown and moves around results filings with pandas",
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
        domains = ctx.get("domains", [])
        calc_ids = [c["id"] for c in ctx.get("calculations", [])]
        sources = ctx.get("sources", [])
        finance_cite = [s["id"] for s in sources if s.get("retrieved_by") == "financial_data"]
        court_cite = [s["id"] for s in sources if s.get("retrieved_by") == "legal_records"]
        web_cite = [s["id"] for s in sources if s.get("retrieved_by") == "web_research"]

        summary: list[DraftParagraph] = []
        sections: list[DraftSection] = []

        if "finance" in domains:
            if ticker and "ret_period" in calc_ids:
                summary.append(DraftParagraph(
                    text=f"{name} ({ticker}) returned {{{{calc:ret_period}}}} between {ctx['period_start']} and "
                    f"{ctx['period_end']}, measured from daily closing prices.",
                    source_ids=finance_cite,
                ))
                market = [
                    DraftParagraph(text="Annualised volatility of daily returns was {{calc:vol_annual}}.", source_ids=finance_cite),
                    DraftParagraph(text="The largest peak-to-trough fall in the period (maximum drawdown) was {{calc:dd_max}}.", source_ids=finance_cite),
                ]
                for calc_id in calc_ids:
                    if calc_id.startswith("ret_results_"):
                        day = _iso_to_words(calc_id.removeprefix("ret_results_"))
                        market.append(DraftParagraph(
                            text=f"Across the company's results filing of {day}, shares returned {{{{calc:{calc_id}}}}}.",
                            source_ids=finance_cite,
                        ))
                market.append(DraftParagraph(text="Prices are split-adjusted daily closes; every figure was computed in code from that series.", source_ids=finance_cite))
                sections.append(DraftSection(kind="market_reaction", heading="Market behaviour", paragraphs=market))
            else:
                summary.append(DraftParagraph(text="No price data was available for this query, so the report contains no figures."))

        if "legal" in domains:
            if court_cite:
                summary.append(DraftParagraph(
                    text="Federal court dockets matching the question were found; the case overview cites them.",
                    source_ids=court_cite[:3],
                ))
                overview = DraftParagraph(
                    text="These dockets come from CourtListener's archive of federal court records. They show that the cases exist and when they were filed; this run has not yet read the filings themselves.",
                    source_ids=court_cite[:5],
                )
            else:
                summary.append(DraftParagraph(text="No matching federal court docket was found, so no primary court record is cited."))
                overview = DraftParagraph(text="No primary court record was found for this question; the report does not invent one.")
            sections.append(DraftSection(kind="case_overview", heading="Case overview", paragraphs=[overview]))
            if web_cite:
                sections.append(DraftSection(kind="legal_developments", heading="Latest developments", paragraphs=[DraftParagraph(
                    text="Official and news sources about the matter are cited here. Their claims have not yet been extracted or verified, so this report does not state what they establish.",
                    source_ids=web_cite[:6],
                )]))

        sections.insert(0, DraftSection(kind="executive_summary", heading="Executive summary", paragraphs=summary or [
            DraftParagraph(text="No sources were found for this question.")
        ]))
        if ticker and "finance" in domains:
            title = f"{name}: price performance over the last {PERIOD_LABEL.get(ctx.get('period') or '', 'period')}"
        else:
            title = "Research summary"
        return ReportDraft(title=title, sections=sections)


MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def _iso_to_words(yyyymmdd: str) -> str:
    """'20260722' -> '22 July 2026' (a date format the number audit allows)."""
    return f"{int(yyyymmdd[6:8])} {MONTH_NAMES[int(yyyymmdd[4:6]) - 1]} {yyyymmdd[:4]}"


CASE_NAME = re.compile(
    r"\b((?:[A-Z][\w.&'-]*|of|the)(?:\s+(?:[A-Z][\w.&'-]*|of|the|LLC|Inc\.?))*)\s+(?:v\.|vs\.?|v)\s+((?:[A-Z][\w.&'-]*)(?:\s+(?:[A-Z][\w.&'-]*|LLC|Inc\.?))*)"
)
QUESTION_WORDS = {"What", "How", "Why", "When", "Where", "Which", "Who", "Is", "Are", "Did", "Does", "Do", "Can", "Research", "The", "A", "An", "Tell", "Give", "Show", "Find", "Latest"}


def find_case_name(query: str) -> str | None:
    m = CASE_NAME.search(query)
    if not m:
        return None
    words = m.group(1).split()
    while words and (words[0][0].islower() or words[0] in QUESTION_WORDS):
        words.pop(0)  # "of United States" -> "United States"
    left = " ".join(words)
    return f"{left} v. {m.group(2)}" if left else None


def legal_keywords(query: str) -> str:
    """Proper nouns plus legal terms, e.g. 'the antitrust case against Google' -> 'Google antitrust'."""
    cleaned = [w.strip("?.,\"").removesuffix("'s").strip("'") for w in query.split()]
    names = [w for w in cleaned if w[:1].isupper() and w not in QUESTION_WORDS]
    terms = [t for t in _matches(query, LEGAL_TERMS) if t not in {"case", "legal"}]
    words = list(dict.fromkeys(" ".join(names + terms).split()))  # "fraud" + "securities fraud" -> no repeats
    return " ".join(words) or query.strip().rstrip("?")
