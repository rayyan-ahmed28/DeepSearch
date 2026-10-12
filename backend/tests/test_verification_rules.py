"""The deterministic verification rules (knowledge file, section 7) and event windows."""

from datetime import date

from app.models.llm_outputs import EventWindow, ExtractedClaim
from app.models.schemas import Calculation, ClaimType, Source, SourceType, VerificationStatus
from app.workers.analysis import analyse_prices
from app.workers.verification import guard_claim_type, source_domain, status_for, verify_claims
from tests.fixtures import FixturePrices


def src(id_: str, kind: SourceType, url: str) -> Source:
    return Source(id=id_, title=id_, url=url, source_type=kind, retrieved_by="web_research")


COURT = src("court", SourceType.OFFICIAL_COURT, "https://www.courtlistener.com/docket/1/")
COMPANY = src("company", SourceType.COMPANY, "https://ir.example.com/release")
NEWS_A = src("news_a", SourceType.REPUTABLE_NEWS, "https://www.reuters.com/a")
NEWS_B = src("news_b", SourceType.REPUTABLE_NEWS, "https://apnews.com/b")
NEWS_A2 = src("news_a2", SourceType.REPUTABLE_NEWS, "https://reuters.com/other")


def test_status_rules():
    S = VerificationStatus
    assert status_for(ClaimType.ESTABLISHED_FACT, [], False) == S.UNVERIFIED
    assert status_for(ClaimType.ALLEGATION, [COURT], False) == S.VERIFIED
    assert status_for(ClaimType.COMPANY_STATEMENT, [COMPANY], False) == S.VERIFIED
    assert status_for(ClaimType.NEWS_REPORT, [COMPANY], False) == S.UNVERIFIED  # company source only verifies its own statements
    assert status_for(ClaimType.NEWS_REPORT, [NEWS_A, NEWS_B], False) == S.CORROBORATED
    assert status_for(ClaimType.NEWS_REPORT, [NEWS_A, NEWS_A2], False) == S.UNVERIFIED  # same outlet twice is not independent
    assert status_for(ClaimType.ESTABLISHED_FACT, [NEWS_A], True) == S.VERIFIED  # computed from the cited data


def test_source_domain_ignores_www():
    assert source_domain("https://www.sec.gov/x") == source_domain("https://sec.gov/y") == "sec.gov"


def test_allegations_can_never_be_upgraded():
    assert guard_claim_type(ClaimType.ALLEGATION, [COURT], False) == ClaimType.ALLEGATION
    assert guard_claim_type(ClaimType.ESTABLISHED_FACT, [COURT], False) == ClaimType.ESTABLISHED_FACT
    assert guard_claim_type(ClaimType.ESTABLISHED_FACT, [NEWS_A], False) == ClaimType.NEWS_REPORT
    assert guard_claim_type(ClaimType.ESTABLISHED_FACT, [COMPANY], False) == ClaimType.COMPANY_STATEMENT
    assert guard_claim_type(ClaimType.ESTABLISHED_FACT, [], False) == ClaimType.ANALYSIS


def test_verify_claims_relabels_strips_and_flags_conflicts():
    calc = Calculation(id="ret_x", description="r", result=-5.0, method="m", unit="%")
    extracted = [
        ExtractedClaim(id="a", text="A fact from news only.", claim_type=ClaimType.ESTABLISHED_FACT, source_ids=["news_a", "ghost"]),
        ExtractedClaim(id="b", text="Shares returned {{calc:ret_x}}.", claim_type=ClaimType.ESTABLISHED_FACT, source_ids=["news_a"], calculation_id="ret_x"),
        ExtractedClaim(id="c", text="Ruling on 1 May 2026.", claim_type=ClaimType.ESTABLISHED_FACT, source_ids=["court"], event_date=date(2026, 5, 1), subject="ruling"),
        ExtractedClaim(id="d", text="Ruling on 2 May 2026.", claim_type=ClaimType.NEWS_REPORT, source_ids=["news_b"], event_date=date(2026, 5, 2), subject="ruling"),
    ]
    claims, audit, notes = verify_claims(extracted, [COURT, NEWS_A, NEWS_B], [calc])
    by_id = {c.id: c for c in claims}

    assert by_id["a"].claim_type == ClaimType.NEWS_REPORT and by_id["a"].source_ids == ["news_a"]
    assert by_id["b"].text == "Shares returned -5.0%." and by_id["b"].value == -5.0
    assert by_id["b"].verification == VerificationStatus.VERIFIED
    assert by_id["c"].verification == by_id["d"].verification == VerificationStatus.CONFLICTING
    assert audit.resolved == ["ret_x"]
    assert any("ghost" in n for n in notes) and any("relabelled" in n for n in notes) and any("disagree" in n for n in notes)


def test_event_window_uses_the_days_either_side():
    points = FixturePrices([100, 110, 99, 121]).history("TEST", "6mo")  # 5, 6, 7, 8 January 2026
    calcs, _ = analyse_prices(points, [EventWindow(id="news", date=date(2026, 1, 6), label="the news")])
    window = next(c for c in calcs if c.id == "ret_news")
    assert window.result == -1.0  # close on 5 Jan (100) to close on 7 Jan (99)
    assert "2026-01-05 close to 2026-01-07 close" in window.description

    outside, _ = analyse_prices(points, [EventWindow(id="late", date=date(2026, 3, 1), label="later news")])
    assert not any(c.id == "ret_late" for c in outside)
