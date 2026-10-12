"""Live check: run real questions through the full pipeline with the keys in backend/.env.

    cd backend
    python scripts/live_smoke.py                      # three standard questions
    python scripts/live_smoke.py --query "..." [--mode legal|finance|legal_finance] [--depth quick|standard|deep]

Needs internet. Uses exactly what the server would use: Gemini if
GEMINI_API_KEY is set (otherwise the rule-based stand-in), Tavily or
DuckDuckGo, CourtListener, Yahoo Finance and, with SEC_EDGAR_USER_AGENT,
SEC EDGAR. Key values are never printed.

A run passes when it completes, retrieves at least one source and its report
passes the audit (every figure from a stored calculation, every citation
resolves). Warnings, such as a rate-limited search, are printed but do not
fail the check. Exit code 0 = all passed.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Settings, load_settings  # noqa: E402
from app.models.schemas import ExecutionStatus, ResearchRequest  # noqa: E402
from app.runs import Run, RunRegistry  # noqa: E402

DEFAULT_QUESTIONS = [
    ("How has Nvidia stock performed over the last year?", "auto"),
    ("What is the latest status of the antitrust case United States v. Google LLC over search?", "auto"),
    ("How did Tesla's stock react to the SEC fraud lawsuit against Elon Musk?", "auto"),
]


def describe_setup(settings: Settings, registry: RunRegistry) -> list[str]:
    llm = (
        f"Gemini ({settings.gemini_model})" if registry.llm.name == "gemini"
        else "rule-based stand-in" + ("" if settings.has_gemini else " (no GEMINI_API_KEY)")
    )
    live = registry.live
    return [
        f"  LLM:           {llm}, budget {settings.llm_call_budget} calls per run",
        f"  Web search:    {live.web.name if live.web else 'none'}" + ("" if settings.tavily_api_key or registry.llm.name == "gemini" else " (keyless; set TAVILY_API_KEY if it rate-limits)"),
        f"  Court records: CourtListener ({'with' if settings.courtlistener_api_token else 'without'} a token)",
        f"  SEC filings:   {'on' if live.filings else 'off (set SEC_EDGAR_USER_AGENT to enable)'}",
        f"  Prices:        {registry.prices.name}",
    ]


def summarise(run: Run, seconds: float) -> tuple[bool, list[str]]:
    state, history = run.state, run.bus.history
    lines: list[str] = []
    final: dict[str, tuple[str, str]] = {}
    for e in history:
        if e.type == "agent_status":
            final[e.payload["agent"]] = (e.payload["status"], e.payload.get("detail", ""))
    calls = sum(1 for e in history if e.type == "activity_log" and e.payload["llm_call"])
    warnings = [f"{e.payload['agent']}: {e.payload['message']}" for e in history
                if e.type == "activity_log" and e.payload["level"] in ("warn", "error")]

    lines.append(f"  result:    {state.execution_status.value} in {seconds:.1f} s; domains: {', '.join(d.value for d in state.detected_domains) or 'none'}")
    lines.append("  agents:    " + ", ".join(f"{a} {s}" for a, (s, _) in final.items()))
    for agent, (status, detail) in final.items():
        if status in ("skipped", "error") and detail:
            lines.append(f"             {agent}: {detail}")
    lines.append(f"  LLM calls: {calls}")
    by_worker = Counter(s.retrieved_by for s in state.sources)
    lines.append("  sources:   " + (", ".join(f"{w} {n}" for w, n in by_worker.items()) or "none"))
    statuses = Counter(c.verification.value for c in state.claims)
    lines.append("  claims:    " + (", ".join(f"{n} {s}" for s, n in sorted(statuses.items())) or "none"))
    for claim in state.claims[:4]:
        lines.append(f"             [{claim.verification.value}] {claim.text[:110]}")
    if state.calculations:
        lines.append("  figures:   " + ", ".join(f"{c.id}={c.result}{c.unit or ''}" for c in state.calculations if not isinstance(c.result, dict)))
    if state.timeline:
        lines.append(f"  timeline:  {len(state.timeline)} event(s)")

    report = state.report
    problems: list[str] = []
    if state.execution_status != ExecutionStatus.COMPLETED:
        problems.append("the run did not complete: " + "; ".join(state.errors))
    if report is None:
        problems.append("no report was produced")
    else:
        a = report.audit
        lines.append(f"  report:    '{report.title}', {len(report.sections)} sections, {a.citations_resolved} citation(s) resolve, audit {'clean' if a.clean else 'NOT clean'}")
        if not a.clean:
            problems.append(f"audit: unresolved {a.figures_unresolved}, free numbers {a.free_numbers}, bad citations {a.citations_removed}")
    if not state.sources:
        problems.append("no sources were retrieved")
    for w in warnings[:8]:
        lines.append(f"  warning:   {w[:150]}")
    if len(warnings) > 8:
        lines.append(f"  warning:   ... and {len(warnings) - 8} more")
    for p in problems:
        lines.append(f"  PROBLEM:   {p}")
    lines.append("  => PASS" if not problems else "  => FAIL")
    return not problems, lines


async def main(questions: list[tuple[str, str]], depth: str) -> int:
    settings = load_settings()
    registry = RunRegistry(settings)
    print("DeepSearch live check (key values are never printed)")
    print("\n".join(describe_setup(settings, registry)))
    passed = 0
    for i, (query, mode) in enumerate(questions, 1):
        print(f"\n[{i}/{len(questions)}] {query}")
        started = time.monotonic()
        run = registry.start(ResearchRequest(query=query, mode=mode, depth=depth))
        await run.task
        ok, lines = summarise(run, time.monotonic() - started)
        print("\n".join(lines), flush=True)
        passed += ok
    print(f"\n{passed} of {len(questions)} run(s) passed")
    return 0 if passed == len(questions) else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--query", help="run this question instead of the three standard ones")
    parser.add_argument("--mode", default="auto", choices=["auto", "legal", "finance", "legal_finance"])
    parser.add_argument("--depth", default="standard", choices=["quick", "standard", "deep"])
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows consoles
    chosen = [(args.query, args.mode)] if args.query else DEFAULT_QUESTIONS
    sys.exit(asyncio.run(main(chosen, args.depth)))
