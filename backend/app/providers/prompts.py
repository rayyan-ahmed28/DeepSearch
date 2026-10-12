"""Prompts for the real LLM. The JSON shape is enforced separately (response schema)."""

from __future__ import annotations

import json
from typing import Any

GUARDRAILS = (
    "Rules: never invent facts, numbers, cases, quotes or URLs. "
    "This is research information, not legal or investment advice."
)


def route(query: str) -> str:
    return (
        "You are the Gateway Router of DeepSearch, a research system with two domains: "
        "legal (court cases, regulators, lawsuits, compliance) and finance (stock prices, "
        "company financials, market reaction). Decide which domains the question needs, "
        "which is primary, and how complex it is. Keep the rationale to one sentence.\n"
        f"{GUARDRAILS}\n\nQuestion: {query}"
    )


def plan_finance(query: str, period: str) -> str:
    return (
        "You are the Finance Manager of DeepSearch. Identify the US-listed company the question "
        "is about and its ticker symbol as used by Yahoo Finance (e.g. TSLA, BRK-B). If no company "
        "is named, return ticker null. List 2-4 short tasks for deterministic workers (fetch price "
        f"history for the period {period}, compute returns and volatility, prepare a chart). "
        "Do not compute or state any numbers.\n"
        f"{GUARDRAILS}\n\nQuestion: {query}"
    )


def report(query: str, context: dict[str, Any]) -> str:
    calcs = [
        {"placeholder": f"{{{{calc:{c['id']}}}}}", "description": c["description"], "value": c["result"], "unit": c.get("unit")}
        for c in context.get("calculations", [])
    ]
    return (
        "You are the Report Architect of DeepSearch. Write a short, plain-English research report "
        "for the question below, with 2-4 sections.\n"
        "Figures: write NO numbers yourself. Every figure must be one of the placeholders listed, "
        "copied exactly (e.g. {{calc:ret_period}}); code replaces them with stored values. The values "
        "are shown only so you can describe direction correctly. Dates may be written as given.\n"
        "Present market impact as possibility, never certainty. State the gaps listed honestly in a "
        "section titled 'What this run did not cover'. End with a one-line reminder that this is not "
        "investment advice.\n"
        f"{GUARDRAILS}\n\n"
        f"Question: {query}\n"
        f"Company: {context.get('company')} ({context.get('ticker')})\n"
        f"Price period: {context.get('period_start')} to {context.get('period_end')}\n"
        f"Calculations: {json.dumps(calcs)}\n"
        f"Gaps: {json.dumps(context.get('gaps', []))}"
    )
