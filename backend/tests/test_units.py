"""Unit tests: event bus, calculations, placeholders, rule-based stand-in, Gemini adapter."""

import asyncio
import json
import math
from types import SimpleNamespace

import pytest

from app.models.llm_outputs import ClaimExtraction, FinancePlan, LegalPlan, ReportDraft, RouterDecision
from app.models.schemas import Calculation, Domain
from app.providers.base import BudgetExceeded, CallCounter, LLMError
from app.providers.fake import FakeLLMProvider, find_ticker
from app.providers.gemini import GeminiProvider, inline_schema
from app.utils.events import EventBus
from app.utils.placeholders import RenderAudit, render
from app.workers.analysis import analyse_prices
from tests.fixtures import FixturePrices


# ── event bus ──────────────────────────────────────────────────────
def test_event_bus_replays_backlog_then_live_events():
    async def scenario():
        bus = EventBus()
        bus.publish("activity_log", {"n": 1})
        bus.publish("activity_log", {"n": 2})

        received = []

        async def listen():
            async for event in bus.stream():
                received.append(event.seq)

        listener = asyncio.create_task(listen())
        await asyncio.sleep(0)
        bus.publish("activity_log", {"n": 3})
        bus.close()
        await listener
        return received

    assert asyncio.run(scenario()) == [1, 2, 3]


def test_event_bus_late_subscriber_and_after():
    async def scenario():
        bus = EventBus()
        for n in range(4):
            bus.publish("activity_log", {"n": n})
        bus.close()
        everything = [e.seq async for e in bus.stream()]
        tail = [e.seq async for e in bus.stream(after=2)]
        return everything, tail

    assert asyncio.run(scenario()) == ([1, 2, 3, 4], [3, 4])


def test_closed_bus_rejects_new_events():
    bus = EventBus()
    bus.close()
    with pytest.raises(RuntimeError):
        bus.publish("activity_log", {})


# ── calculations ───────────────────────────────────────────────────
def test_analyse_prices_known_series():
    points = FixturePrices([100, 110, 99, 121]).history("TEST", "6mo")
    calcs, chart = analyse_prices(points)
    by_id = {c.id: c for c in calcs}

    assert by_id["ret_period"].result == 21.0  # 121 / 100 - 1
    assert by_id["dd_max"].result == -10.0  # 110 -> 99
    daily = [110 / 100 - 1, 99 / 110 - 1, 121 / 99 - 1]
    mean = sum(daily) / 3
    sample_std = math.sqrt(sum((d - mean) ** 2 for d in daily) / 2)
    assert by_id["vol_annual"].result == round(sample_std * math.sqrt(252) * 100, 2)
    assert all(c.unit == "%" and c.method.startswith("pandas") for c in calcs)
    assert chart.type == "line" and len(chart.data) == 4 and chart.data[0] == {"date": "2026-01-05", "close": 100.0}


def test_analyse_prices_needs_two_points():
    with pytest.raises(ValueError):
        analyse_prices(FixturePrices([100]).history("TEST", "6mo"))


# ── placeholders (D20) ─────────────────────────────────────────────
def test_placeholders_fill_and_audit():
    calcs = {"ret_period": Calculation(id="ret_period", description="r", result=-12.345, method="m", unit="%")}
    audit = RenderAudit()
    text = render("Shares returned {{calc:ret_period}} from 2026-01-05 to 2026-04-01 in 2026.", calcs, audit)
    assert text == "Shares returned -12.3% from 2026-01-05 to 2026-04-01 in 2026."
    assert audit.resolved == ["ret_period"] and audit.clean

    audit = RenderAudit()
    render("The court ruled on 10 April 2026, before 2 May 2026.", calcs, audit)
    assert audit.free_numbers == []  # written dates are not figures

    audit = RenderAudit()
    text = render("Volatility was {{calc:missing}} and about 45 percent.", calcs, audit)
    assert text == "Volatility was [figure unavailable] and about 45 percent."
    assert audit.unresolved == ["missing"]
    assert audit.free_numbers == ["45"]
    assert not audit.clean


# ── rule-based stand-in ────────────────────────────────────────────
@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("Latest status of the antitrust case against Example Corp", [Domain.LEGAL]),
        ("How has Tesla stock performed this year?", [Domain.FINANCE]),
        ("How could a lawsuit affect the stock price of Example Corp?", None),  # both, either order
        ("Tell me about Example Corp", [Domain.FINANCE, Domain.LEGAL]),
    ],
)
def test_fake_router(query, expected):
    decision = asyncio.run(FakeLLMProvider().generate("route", "", RouterDecision, {"query": query}))
    if expected is None:
        assert set(decision.domains) == {Domain.LEGAL, Domain.FINANCE}
    else:
        assert decision.domains == expected
    assert decision.primary_domain == decision.domains[0]


@pytest.mark.parametrize(
    ("query", "ticker"),
    [
        ("How did $TSLA do?", "TSLA"),
        ("Apple (AAPL) earnings", "AAPL"),
        ("Recent stock performance of Tesla", "TSLA"),
        ("Berkshire Hathaway shares", "BRK-B"),
        ("What did the SEC and the CEO say?", None),
    ],
)
def test_find_ticker(query, ticker):
    assert find_ticker(query)[1] == ticker


@pytest.mark.parametrize(
    ("query", "period"),
    [
        ("How has Nvidia stock performed over the last year?", "1y"),
        ("Tesla shares over the past 3 months", "3mo"),
        ("Apple stock over two years", "2y"),
        ("how have microsoft grown in the pat 5 years its stocks basically", "5y"),
        ("How has Tesla stock performed?", "6mo"),  # none named: depth default
    ],
)
def test_fake_plan_uses_the_period_in_the_question(query, period):
    plan = asyncio.run(FakeLLMProvider().generate("plan_finance", "", FinancePlan, {"query": query, "period": "6mo"}))
    assert plan.period == period


def test_fake_plan_without_ticker_asks_for_one():
    plan = asyncio.run(FakeLLMProvider().generate("plan_finance", "", FinancePlan, {"query": "the market", "period": "6mo"}))
    assert plan.ticker is None and "$TSLA" in plan.rationale


def test_fake_provider_rejects_unknown_purpose():
    with pytest.raises(LLMError):
        asyncio.run(FakeLLMProvider().generate("poem", "", RouterDecision, {}))


def test_call_counter_enforces_budget():
    counter = CallCounter(limit=2)
    counter.take()
    counter.take()
    with pytest.raises(BudgetExceeded):
        counter.take()


# ── Gemini adapter (no network: the SDK client is stubbed) ─────────
class ApiError(Exception):
    """Shaped like google.genai.errors.APIError: an HTTP status in `code`."""

    def __init__(self, code: int) -> None:
        super().__init__(f"{code} error")
        self.code = code


def _gemini_with(*replies) -> tuple[GeminiProvider, list[dict]]:
    """A provider whose client answers with `replies` in turn (an exception is raised, text is returned)."""
    calls: list[dict] = []
    queue = list(replies)

    async def generate_content(**kwargs):
        calls.append(kwargs)
        reply = queue.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return SimpleNamespace(text=reply)

    client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate_content)))
    return GeminiProvider(api_key="test-key", model="gemini-test", client=client), calls


_real_sleep = asyncio.sleep


def no_wait(seconds):
    return _real_sleep(0)


ROUTE_JSON = '{"domains": ["finance"], "primary_domain": "finance", "complexity": "low", "rationale": "r"}'


def test_gemini_validates_json_against_the_schema():
    provider, calls = _gemini_with(ROUTE_JSON)
    assert asyncio.run(provider.generate("route", "p", RouterDecision, {})).domains == [Domain.FINANCE]
    config = calls[0]["config"]
    assert config["response_mime_type"] == "application/json"
    assert config["response_json_schema"]["properties"]["primary_domain"]["enum"] == ["legal", "finance"]
    assert calls[0]["model"] == "gemini-test"


@pytest.mark.parametrize("model", [RouterDecision, LegalPlan, FinancePlan, ClaimExtraction, ReportDraft])
def test_every_llm_schema_is_sent_without_refs(model):
    schema = inline_schema(model)
    assert "$ref" not in json.dumps(schema) and "$defs" not in schema


def test_gemini_retries_once_on_rate_limit(monkeypatch):
    monkeypatch.setattr("app.providers.gemini.asyncio.sleep", no_wait)
    provider, calls = _gemini_with(ApiError(429), ROUTE_JSON)
    assert asyncio.run(provider.generate("route", "p", RouterDecision, {})).primary_domain == Domain.FINANCE
    assert len(calls) == 2


def test_gemini_rejected_key_is_not_retried_and_never_echoed():
    provider, calls = _gemini_with(ApiError(403))
    with pytest.raises(LLMError) as err:
        asyncio.run(provider.generate("route", "p", RouterDecision, {}))
    assert len(calls) == 1
    assert "HTTP 403" in str(err.value) and "test-key" not in str(err.value)


@pytest.mark.parametrize("reply", [RuntimeError("connection reset"), "not json", None])
def test_gemini_failures_become_llm_error(reply, monkeypatch):
    monkeypatch.setattr("app.providers.gemini.asyncio.sleep", no_wait)
    provider, _ = _gemini_with(reply, reply)
    with pytest.raises(LLMError):
        asyncio.run(provider.generate("route", "p", RouterDecision, {}))
