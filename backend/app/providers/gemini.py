"""Gemini via the google-genai SDK, with JSON output enforced by a JSON schema.

The schema comes from the Pydantic model with every $ref inlined, since the
API accepts only a subset of JSON Schema. The reply is then validated by the
same Pydantic model; anything that does not match becomes an LLMError, and
the run falls back to the rule-based stand-in for that step (and says so).
"""

from __future__ import annotations

import asyncio
import copy
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from app.providers.base import LLMError

T = TypeVar("T", bound=BaseModel)

ATTEMPTS = 2  # one retry, only for rate limits and server errors
RETRY_STATUS = {429, 500, 503}
TIMEOUT_MS = 90_000


def inline_schema(model: type[BaseModel]) -> dict[str, Any]:
    """The model's JSON schema with every $ref replaced by its definition (no recursion in our models)."""
    schema = model.model_json_schema()
    defs = schema.pop("$defs", {})

    def resolve(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                target = copy.deepcopy(defs[node["$ref"].rsplit("/", 1)[-1]])
                extra = {k: v for k, v in node.items() if k != "$ref"}
                return resolve({**target, **extra})
            return {k: resolve(v) for k, v in node.items()}
        if isinstance(node, list):
            return [resolve(v) for v in node]
        return node

    return resolve(schema)


def _status(exc: Exception) -> int | None:
    code = getattr(exc, "code", None)
    return code if isinstance(code, int) else None


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: str, model: str, client: Any = None) -> None:
        self.model = model
        if client is None:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=TIMEOUT_MS))
        self._client = client

    async def generate(self, purpose: str, prompt: str, schema: type[T], context: dict[str, Any]) -> T:
        config = {
            "response_mime_type": "application/json",
            "response_json_schema": inline_schema(schema),
            "temperature": 0.2,
        }
        for attempt in range(1, ATTEMPTS + 1):
            try:
                response = await self._client.aio.models.generate_content(model=self.model, contents=prompt, config=config)
                break
            except Exception as exc:  # network, quota (429), auth: all become LLMError, never the key
                status = _status(exc)
                if attempt < ATTEMPTS and status in RETRY_STATUS:
                    await asyncio.sleep(2.0)
                    continue
                detail = f"HTTP {status}" if status else type(exc).__name__
                hint = {429: " (rate limit or free-tier quota)", 400: " (bad request: check GEMINI_MODEL)",
                        403: " (key rejected)", 404: " (model not found: check GEMINI_MODEL)"}.get(status or 0, "")
                raise LLMError(f"Gemini request failed: {detail}{hint}") from exc

        try:
            return schema.model_validate_json(response.text or "")
        except ValidationError as exc:
            raise LLMError(f"Gemini returned output that does not match {schema.__name__}") from exc
