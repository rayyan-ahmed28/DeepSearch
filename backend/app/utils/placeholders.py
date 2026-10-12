"""Fill {{calc:<id>}} placeholders from stored calculations and audit the result (D20).

The Report Architect never writes figures; it writes placeholders. Here code
substitutes the stored value, so every number in a report traces to a
`Calculation`. Placeholders that do not resolve are replaced with
"[figure unavailable]", and any number the LLM wrote by itself is flagged.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.models.schemas import Calculation

PLACEHOLDER = re.compile(r"\{\{calc:([A-Za-z0-9_\-]+)\}\}")
# Numbers allowed in free text: dates (2026-04-10, 10 April 2026) and four-digit years.
MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"
ALLOWED_NUMBERS = re.compile(
    r"\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2} (?:" + MONTHS + r") (?:19|20)\d{2}\b|\b(?:19|20)\d{2}\b"
)
ANY_NUMBER = re.compile(r"\d+(?:[.,]\d+)*")


@dataclass
class RenderAudit:
    resolved: list[str] = field(default_factory=list)
    unresolved: list[str] = field(default_factory=list)
    free_numbers: list[str] = field(default_factory=list)

    @property
    def clean(self) -> bool:
        return not self.unresolved and not self.free_numbers


def format_calculation(calc: Calculation) -> str:
    if isinstance(calc.result, dict):
        return "[see data]"
    if calc.unit == "%":
        return f"{calc.result:.1f}%"
    if calc.unit:
        return f"{calc.result:,.2f} {calc.unit}"
    return f"{calc.result:,.2f}"


def render(text: str, calcs: dict[str, Calculation], audit: RenderAudit) -> str:
    """Replace placeholders in one paragraph, recording what happened in `audit`."""
    without_placeholders = PLACEHOLDER.sub("", text)
    without_allowed = ALLOWED_NUMBERS.sub("", without_placeholders)
    audit.free_numbers += ANY_NUMBER.findall(without_allowed)

    def substitute(match: re.Match[str]) -> str:
        calc_id = match.group(1)
        calc = calcs.get(calc_id)
        if calc is None:
            audit.unresolved.append(calc_id)
            return "[figure unavailable]"
        audit.resolved.append(calc_id)
        return format_calculation(calc)

    return PLACEHOLDER.sub(substitute, text)
