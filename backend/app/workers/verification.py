"""Verification rules (deterministic): the status of every claim is decided here, never by an LLM.

Rules (knowledge file, section 7):
- no source                                   -> unverified
- an official court or regulatory source       -> verified
- a company statement backed by a company source -> verified
- a figure computed in code from the cited data  -> verified (against that data)
- two or more independent web domains agree    -> corroborated
- otherwise                                    -> unverified
- claims about the same subject that disagree on the date or figure -> all conflicting

Guardrail: a claim can only be an "established fact" if an official or
regulatory source, or a stored calculation, backs it. Otherwise it is
relabelled (news report, or analysis when it has no source at all), so an
allegation can never slip through as fact.
"""

from __future__ import annotations

from app.models.llm_outputs import ExtractedClaim
from app.models.schemas import Calculation, Claim, ClaimType, Source, SourceType, VerificationStatus
from app.utils.placeholders import RenderAudit, render
from app.workers.source_types import registrable_domain

OFFICIAL = {SourceType.OFFICIAL_COURT, SourceType.REGULATORY}


def source_domain(url: str) -> str:
    """Domain used to judge independence: www.sec.gov -> sec.gov, news.bbc.co.uk -> bbc.co.uk."""
    return registrable_domain(url)


def status_for(claim_type: ClaimType, sources: list[Source], has_calculation: bool) -> VerificationStatus:
    if not sources and not has_calculation:
        return VerificationStatus.UNVERIFIED
    if any(s.source_type in OFFICIAL for s in sources):
        return VerificationStatus.VERIFIED
    if claim_type == ClaimType.COMPANY_STATEMENT and any(s.source_type == SourceType.COMPANY for s in sources):
        return VerificationStatus.VERIFIED
    if has_calculation and sources:
        return VerificationStatus.VERIFIED  # the figure was computed by code from the cited data
    independent = {source_domain(s.url) for s in sources if s.url}
    if len(independent) >= 2:
        return VerificationStatus.CORROBORATED
    return VerificationStatus.UNVERIFIED


def guard_claim_type(claim_type: ClaimType, sources: list[Source], has_calculation: bool) -> ClaimType:
    if claim_type != ClaimType.ESTABLISHED_FACT:
        return claim_type
    if has_calculation or any(s.source_type in OFFICIAL for s in sources):
        return claim_type
    if any(s.source_type == SourceType.COMPANY for s in sources):
        return ClaimType.COMPANY_STATEMENT
    return ClaimType.NEWS_REPORT if sources else ClaimType.ANALYSIS


def verify_claims(
    extracted: list[ExtractedClaim],
    sources: list[Source],
    calculations: list[Calculation],
) -> tuple[list[Claim], RenderAudit, list[str]]:
    """Apply the rules. Returns the claims, the figure audit, and notes on anything changed."""
    by_id = {s.id: s for s in sources}
    calcs = {c.id: c for c in calculations}
    audit = RenderAudit()
    notes: list[str] = []
    claims: list[Claim] = []

    for raw in extracted:
        cited = [by_id[i] for i in raw.source_ids if i in by_id]
        missing = [i for i in raw.source_ids if i not in by_id]
        if missing:
            notes.append(f"Claim {raw.id}: removed citation(s) to unknown source(s) {', '.join(missing)}")
        calc = calcs.get(raw.calculation_id) if raw.calculation_id else None
        if raw.calculation_id and calc is None:
            notes.append(f"Claim {raw.id}: no stored calculation '{raw.calculation_id}'")

        claim_type = guard_claim_type(raw.claim_type, cited, calc is not None)
        if claim_type != raw.claim_type:
            notes.append(f"Claim {raw.id}: relabelled {raw.claim_type.value} -> {claim_type.value} (no official source)")

        claims.append(
            Claim(
                id=raw.id,
                text=render(raw.text, calcs, audit),
                claim_type=claim_type,
                source_ids=[s.id for s in cited],
                verification=status_for(claim_type, cited, calc is not None),
                domain=raw.domain,
                event_date=raw.event_date,
                value=calc.result if calc is not None and isinstance(calc.result, float) else None,
                unit=calc.unit if calc is not None else None,
                calculation_id=calc.id if calc is not None else None,
            )
        )

    # Conflicts: claims about the same subject must agree on date and figure.
    by_subject: dict[str, list[int]] = {}
    for i, raw in enumerate(extracted):
        if raw.subject:
            by_subject.setdefault(raw.subject, []).append(i)
    for subject, indexes in by_subject.items():
        group = [claims[i] for i in indexes]
        dates = {c.event_date for c in group if c.event_date}
        values = {c.value for c in group if c.value is not None}
        if len(dates) > 1 or len(values) > 1:
            for i in indexes:
                claims[i] = claims[i].model_copy(update={"verification": VerificationStatus.CONFLICTING})
            notes.append(f"Sources disagree about '{subject}': {len(indexes)} claims marked conflicting")
    return claims, audit, notes
