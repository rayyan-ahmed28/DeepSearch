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
        "is named, return ticker null. Set period to the time frame the question asks about "
        f"(3mo, 6mo, 1y or 2y); if it names none, use {period}. List 2-4 short tasks for deterministic "
        "workers (fetch price history for that period, compute returns and volatility, prepare a chart). "
        "Do not compute or state any numbers.\n"
        f"{GUARDRAILS}\n\nQuestion: {query}"
    )


def plan_legal(query: str) -> str:
    return (
        "You are the Legal Manager of DeepSearch. Identify the case or regulatory matter the question is "
        "about and list 2-4 short research tasks for workers (court records, regulator releases, reputable "
        "news, a dated timeline). Prefer official court and regulatory sources. Do not state findings.\n"
        f"{GUARDRAILS}\n\nQuestion: {query}"
    )


def extract_claims(query: str, sources: list, calculations: list) -> str:
    listed = [{"id": s.id, "title": s.title, "type": s.source_type.value, "excerpt": s.snippet} for s in sources]
    calcs = [{"placeholder": f"{{{{calc:{c.id}}}}}", "description": c.description} for c in calculations]
    return (
        "You are the claim extractor in DeepSearch's Verification step. From the sources below, list the key "
        "claims needed to answer the question. For each: the text, its claim_type (established_fact only for "
        "what an official or court source states as fact or what a calculation shows; allegation, party_claim, "
        "company_statement, regulatory_statement, news_report or analysis otherwise), the ids of the sources "
        "that state it, its domain, any event date, and a shared subject key for claims about the same fact. "
        "Write figures only as the calculation placeholders listed and set calculation_id. Do not judge "
        "whether claims are verified: code applies the rules.\n"
        f"{GUARDRAILS}\n\n"
        f"Question: {query}\n"
        f"Sources: {json.dumps(listed)}\n"
        f"Calculations: {json.dumps(calcs)}"
    )


def report(query: str, context: dict[str, Any]) -> str:
    calcs = [
        {"placeholder": f"{{{{calc:{c['id']}}}}}", "description": c["description"], "value": c["result"], "unit": c.get("unit")}
        for c in context.get("calculations", [])
    ]
    domains = context.get("domains", [])
    kinds = ["executive_summary", "risk_factors"]
    if "legal" in domains:
        kinds += ["case_overview", "legal_developments"]
    if "finance" in domains:
        kinds += ["financial_impact", "market_reaction"]
    return (
        "You are the Report Architect of DeepSearch. Write the narrative sections of a short, plain-English "
        f"research report for the question below. Use only these section kinds: {', '.join(kinds)}. Always "
        "include executive_summary. Do not write limitations, sources or disclaimer sections: code adds them.\n"
        "Figures: write NO numbers yourself. Every figure must be one of the placeholders listed, copied exactly "
        "(e.g. {{calc:ret_period}}); code replaces them with stored values. Values are shown only so you can "
        "describe direction correctly. Dates may be written as given.\n"
        "Citations: for each paragraph, list in source_ids the ids of the sources it relies on, chosen only from "
        "the sources listed. Never invent a source.\n"
        "Attribute claims, label allegations as allegations, and present market impact as possibility, never "
        "certainty.\n"
        f"{GUARDRAILS}\n\n"
        f"Question: {query}\n"
        f"Company: {context.get('company')} ({context.get('ticker')})\n"
        f"Price period: {context.get('period_start')} to {context.get('period_end')}\n"
        f"Calculations: {json.dumps(calcs)}\n"
        f"Sources: {json.dumps(context.get('sources', []))}"
    )
