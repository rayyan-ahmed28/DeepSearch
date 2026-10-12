"""SEC EDGAR filings for the Financial Data worker (D3). Free, no key.

SEC policy requires a descriptive User-Agent with a contact address, so this
only runs when SEC_EDGAR_USER_AGENT is set. Results 8-Ks (item 2.02) in the
price period also become event windows for the Data Analysis worker.
"""

from __future__ import annotations

from datetime import date
from typing import Protocol

import httpx

from app.models.llm_outputs import EventWindow
from app.models.schemas import Source, SourceType

TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
FORMS = {"8-K", "10-Q", "10-K"}
ITEM_NAMES = {
    "1.01": "material agreement",
    "2.02": "results of operations",
    "2.03": "financial obligation",
    "5.02": "director or officer change",
    "7.01": "Regulation FD disclosure",
    "8.01": "other events",
}


class FilingsError(RuntimeError):
    pass


class Filings(Protocol):
    name: str

    async def recent(self, ticker: str, start: date, end: date, limit: int) -> tuple[list[Source], list[EventWindow]]: ...


class EdgarFilings:
    name = "SEC EDGAR"

    def __init__(self, user_agent: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        if not user_agent:
            raise FilingsError("SEC_EDGAR_USER_AGENT is not set (SEC policy requires a contact address)")
        self.user_agent = user_agent
        self.transport = transport
        self._ciks: dict[str, tuple[int, str]] | None = None

    async def _get(self, client: httpx.AsyncClient, url: str) -> dict:
        try:
            response = await client.get(url)
        except httpx.HTTPError as exc:
            raise FilingsError(f"EDGAR unreachable ({type(exc).__name__})") from exc
        if response.status_code != 200:
            raise FilingsError(f"EDGAR returned HTTP {response.status_code}")
        return response.json()

    async def recent(self, ticker: str, start: date, end: date, limit: int) -> tuple[list[Source], list[EventWindow]]:
        async with httpx.AsyncClient(transport=self.transport, timeout=20, headers={"User-Agent": self.user_agent}) as client:
            if self._ciks is None:
                table = await self._get(client, TICKERS_URL)
                self._ciks = {row["ticker"].upper(): (int(row["cik_str"]), row["title"]) for row in table.values()}
            match = self._ciks.get(ticker.upper())
            if match is None:
                raise FilingsError(f"No EDGAR company for ticker {ticker}")
            cik, company = match
            recent = (await self._get(client, SUBMISSIONS_URL.format(cik=cik)))["filings"]["recent"]

        sources: list[Source] = []
        events: list[EventWindow] = []
        for form, filed, accession, doc, items in zip(
            recent["form"], recent["filingDate"], recent["accessionNumber"], recent["primaryDocument"], recent.get("items", [])
        ):
            filed_on = date.fromisoformat(filed)
            if form not in FORMS or not (start <= filed_on <= end):
                continue
            codes = [c.strip() for c in (items or "").split(",") if c.strip()]
            described = ", ".join(f"{c} {ITEM_NAMES[c]}" for c in codes if c in ITEM_NAMES)
            sources.append(Source(
                id=f"edgar_{accession.replace('-', '')}",
                title=f"{company} Form {form} filed {filed_on}" + (f" ({described})" if described else ""),
                url=f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession.replace('-', '')}/{doc}",
                source_type=SourceType.COMPANY,
                published_date=filed_on,
                retrieved_by="financial_data",
                snippet=f"Form {form} filed with the SEC on {filed_on}" + (f"; items: {described}." if described else "."),
            ))
            if form == "8-K" and "2.02" in codes:
                events.append(EventWindow(id=f"results_{filed_on:%Y%m%d}", date=filed_on, label=f"the results filing of {filed_on}"))
        return sources[:limit], events
