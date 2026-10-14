"""Rule-based stand-in for the LLM, used when no Gemini key is configured.

It returns the same structured outputs as Gemini, built with plain rules, so
the whole pipeline runs with zero keys (Demo Mode). The UI labels these calls
as a stand-in; it never pretends to be a model.
"""

from __future__ import annotations

import re
from typing import Any, TypeVar

from pydantic import BaseModel

from app.models.llm_outputs import (
    ClaimExtraction,
    DraftParagraph,
    DraftSection,
    ExtractedClaim,
    FinancePlan,
    LegalPlan,
    ReportDraft,
    RouterDecision,
)
from app.models.schemas import ClaimType, Domain
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

PERIOD_LABEL = {"3mo": "three months", "6mo": "six months", "1y": "year", "2y": "two years", "5y": "five years"}

# A time frame named in the question wins over the depth default.
PERIOD_PATTERNS = (
    ("5y", re.compile(r"\b(?:five|5)[ -]years?\b|\bhalf a decade\b")),
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
            "extract_claims": self._extract_claims,
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

    def _extract_claims(self, ctx: dict[str, Any]) -> ClaimExtraction:
        """Claims only from structured records: computed figures, SEC filings and court dockets.

        The stand-in cannot read news or web pages, so it states nothing about
        them; with a Gemini key the model reads those excerpts too.
        """
        name = ctx.get("company") or ctx.get("ticker") or "The company"
        sources = ctx.get("sources", [])
        prices = [s["id"] for s in sources if s["retrieved_by"] == "financial_data" and s["source_type"] != "company"]
        filings = [s for s in sources if s["retrieved_by"] == "financial_data" and s["source_type"] == "company"]
        dockets = [s for s in sources if s["retrieved_by"] == "legal_records"]
        claims: list[ExtractedClaim] = []

        def figure(calc_id: str, text: str, cited: list[str], event_date: str | None = None) -> None:
            claims.append(ExtractedClaim(
                id=f"claim_{calc_id}", text=text, claim_type=ClaimType.ESTABLISHED_FACT, source_ids=cited,
                domain=Domain.FINANCE, calculation_id=calc_id, subject=calc_id, event_date=event_date,
            ))

        for calc in ctx.get("calculations", []):
            calc_id = calc["id"]
            if calc_id == "ret_period" and ctx.get("period_start"):
                figure(calc_id, f"{name} shares returned {{{{calc:ret_period}}}} between {_words(ctx['period_start'])} "
                       f"and {_words(ctx['period_end'])}.", prices)
            elif calc_id == "vol_annual":
                figure(calc_id, f"Annualised volatility of {name}'s daily returns over the period was {{{{calc:vol_annual}}}}.", prices)
            elif calc_id == "dd_max":
                figure(calc_id, f"{name}'s largest peak-to-trough fall in the period (maximum drawdown) was {{{{calc:dd_max}}}}.", prices)
            elif calc_id.startswith("ret_results_"):
                day = calc_id.removeprefix("ret_results_")
                iso = f"{day[:4]}-{day[4:6]}-{day[6:8]}"
                filing = [s["id"] for s in filings if s.get("published_date") == iso]
                figure(calc_id, f"Across the results filing of {_words(iso)}, {name} shares returned {{{{calc:{calc_id}}}}}.",
                       prices + filing, iso)
            elif calc_id.startswith("ret_"):  # an event from the Finance Manager's plan
                figure(calc_id, f"{calc['description']}: {{{{calc:{calc_id}}}}}.", prices)

        for filing in filings[:4]:
            claims.append(ExtractedClaim(
                id=f"claim_{filing['id']}", text=f"SEC records show {filing['title']}.",
                claim_type=ClaimType.COMPANY_STATEMENT, source_ids=[filing["id"]], domain=Domain.FINANCE,
                event_date=filing.get("published_date"),
            ))

        for docket in dockets[:5]:
            filed = docket.get("published_date")
            text = f"Court records list {docket['title']}" + (f", filed {_words(filed)}." if filed else ".")
            ended = TERMINATED.search(docket.get("snippet") or "")
            if ended:
                text += f" The docket was closed on {_words(ended.group(1))}."
            case, _, court = docket["title"].partition(" (")
            # Only the case the question names goes on its timeline; a docket search also returns other cases.
            on_timeline = filed and same_case(ctx.get("case_name"), case)
            claims.append(ExtractedClaim(
                id=f"claim_{docket['id']}", text=text, claim_type=ClaimType.ESTABLISHED_FACT,
                source_ids=[docket["id"]], domain=Domain.LEGAL, event_date=filed, subject=f"docket_{docket['id']}",
                timeline_label=f"Case filed in {court.split(', No.')[0]}" if on_timeline else None,
            ))
        return ClaimExtraction(claims=claims)

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
                    text="These dockets come from CourtListener's archive of federal court records. They show that the cases exist and when they were filed; this run did not read the filings themselves.",
                    source_ids=court_cite[:5],
                )
            else:
                summary.append(DraftParagraph(text="No matching federal court docket was found, so no primary court record is cited."))
                overview = DraftParagraph(text="No primary court record was found for this question; the report does not invent one.")
            sections.append(DraftSection(kind="case_overview", heading="Case overview", paragraphs=[overview]))
            if web_cite:
                sections.append(DraftSection(kind="legal_developments", heading="Latest developments", paragraphs=[DraftParagraph(
                    text="Official and news sources about the matter are cited here. Without a Gemini key the rule-based stand-in does not read them, so this report does not state what they establish.",
                    source_ids=web_cite[:6],
                )]))

        cited = {s for c in ctx.get("claims", []) for s in c["source_ids"]}
        records = [label for label, ids in (
            ("computed price figures", [i for i in finance_cite if not i.startswith("edgar_")]),
            ("SEC filings", [i for i in finance_cite if i.startswith("edgar_")]),
            ("court dockets", court_cite),
        ) if cited & set(ids)]
        if records:
            listed = records[0] if len(records) == 1 else ", ".join(records[:-1]) + " and " + records[-1]
            summary.append(DraftParagraph(
                text=f"The key findings come from structured records ({listed}); code set each one's verification status.",
            ))
        sections.insert(0, DraftSection(kind="executive_summary", heading="Executive summary", paragraphs=summary or [
            DraftParagraph(text="No sources were found for this question.")
        ]))
        if ticker and "finance" in domains:
            title = f"{name}: price performance over the last {PERIOD_LABEL.get(ctx.get('period') or '', 'period')}"
        else:
            title = "Research summary"
        return ReportDraft(title=title, sections=sections)


MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


TERMINATED = re.compile(r"Terminated (\d{4}-\d{2}-\d{2})")


def _iso_to_words(yyyymmdd: str) -> str:
    """'20260722' -> '22 July 2026' (a date format the number audit allows)."""
    return f"{int(yyyymmdd[6:8])} {MONTH_NAMES[int(yyyymmdd[4:6]) - 1]} {yyyymmdd[:4]}"


def _words(iso: str) -> str:
    """'2026-07-22' -> '22 July 2026'."""
    return _iso_to_words(iso.replace("-", ""))


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


PARTY_ALIASES = {"united": ("usa", "u.s."), "sec": ("securities",), "securities": ("sec",)}
PARTY_IGNORED = {"the", "in", "re", "re:", "of", "and", "llc", "inc", "inc.", "corp", "corp.", "co.", "ltd", "company", "corporation"}


def same_case(case_name: str | None, docket_case: str) -> bool:
    """Whether a docket's caption names both parties: 'USA v. Google LLC' ~ 'United States v. Google LLC'."""
    if not case_name or " v. " not in case_name:
        return False
    caption = docket_case.lower()

    def named(word: str) -> bool:
        return re.search(rf"(?<![\w.]){re.escape(word)}(?!\w)", caption) is not None

    for party in case_name.split(" v. ", 1):
        words = [w for w in party.lower().split() if w not in PARTY_IGNORED] or party.lower().split()
        if not any(named(w) or any(named(a) for a in PARTY_ALIASES.get(w, ())) for w in words):
            return False
    return True


def legal_keywords(query: str) -> str:
    """Proper nouns plus legal terms, e.g. 'the antitrust case against Google' -> 'Google antitrust'."""
    cleaned = [w.strip("?.,\"").removesuffix("'s").strip("'") for w in query.split()]
    names = [w for w in cleaned if w[:1].isupper() and w not in QUESTION_WORDS]
    terms = [t for t in _matches(query, LEGAL_TERMS) if t not in {"case", "legal"}]
    words = list(dict.fromkeys(" ".join(names + terms).split()))  # "fraud" + "securities fraud" -> no repeats
    return " ".join(words) or query.strip().rstrip("?")
