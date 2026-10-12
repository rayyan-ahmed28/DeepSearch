"""Take a real price snapshot for a demo scenario (needs internet; run locally).

    python scripts/snapshot_prices.py <scenario_id> <TICKER> <start YYYY-MM-DD> <end YYYY-MM-DD>

Fetches daily closes from Yahoo Finance (split-adjusted, like the live Financial
Data worker) and writes them into app/demo/scenarios/<scenario_id>.json under
"prices", with today's date as the snapshot date. Re-run it to refresh a
scenario; then run the tests, which reject a scenario whose figures no longer
match its narrative.
"""

from __future__ import annotations

import json
import math
import sys
from datetime import date, timedelta
from pathlib import Path

import yfinance as yf

SCENARIO_DIR = Path(__file__).resolve().parent.parent / "app" / "demo" / "scenarios"


def main(scenario_id: str, ticker: str, start: str, end: str) -> None:
    path = SCENARIO_DIR / f"{scenario_id}.json"
    scenario = json.loads(path.read_text(encoding="utf-8"))

    end_inclusive = (date.fromisoformat(end) + timedelta(days=1)).isoformat()  # yfinance's end is exclusive
    df = yf.Ticker(ticker).history(start=start, end=end_inclusive, interval="1d", auto_adjust=False)
    if df.empty:
        raise SystemExit(f"No data returned for {ticker} {start}..{end}")

    closes = []
    for ts, row in df.iterrows():
        close = float(row["Close"])
        if math.isnan(close):
            continue
        volume = row.get("Volume")
        closes.append({
            "ticker": ticker,
            "date": ts.date().isoformat(),
            "close": round(close, 4),
            "volume": None if volume is None or math.isnan(float(volume)) else int(volume),
            "split_adjusted": True,
        })

    scenario["prices"] = {"ticker": ticker, "snapshot_taken": date.today().isoformat(), "closes": closes}
    path.write_text(json.dumps(scenario, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(f"{scenario_id}: {len(closes)} closes for {ticker}, {closes[0]['date']} to {closes[-1]['date']}")


if __name__ == "__main__":
    if len(sys.argv) != 5:
        raise SystemExit(__doc__)
    main(*sys.argv[1:])
