"""The LLM provider interface (decision D1) and the per-run call budget (D9)."""

from __future__ import annotations

from typing import Any, Protocol, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class LLMError(RuntimeError):
    """The provider failed or returned output that does not match the schema."""


class BudgetExceeded(RuntimeError):
    """A run tried to make more LLM calls than its budget allows."""


class LLMProvider(Protocol):
    name: str  # "gemini" | "fake"

    async def generate(self, purpose: str, prompt: str, schema: type[T], context: dict[str, Any]) -> T:
        """Return an instance of `schema`.

        `prompt` is what a real model reads; `context` carries the same facts as
        data, for the rule-based stand-in. Raise LLMError on any failure.
        """
        ...


class CallCounter:
    """Counts LLM calls in one run and refuses to go over the budget."""

    def __init__(self, limit: int) -> None:
        self.limit = limit
        self.used = 0

    def take(self) -> None:
        if self.used >= self.limit:
            raise BudgetExceeded(f"LLM call budget of {self.limit} reached")
        self.used += 1
