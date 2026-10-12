"""Gemini via the google-genai SDK, with JSON output enforced by a Pydantic schema."""

from __future__ import annotations

from typing import Any, TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError

from app.providers.base import LLMError

T = TypeVar("T", bound=BaseModel)


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: str, model: str) -> None:
        self.model = model
        self._client = genai.Client(api_key=api_key)

    async def generate(self, purpose: str, prompt: str, schema: type[T], context: dict[str, Any]) -> T:
        try:
            response = await self._client.aio.models.generate_content(
                model=self.model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=schema,
                    temperature=0.2,
                ),
            )
        except Exception as exc:  # network, quota (429), auth: all become LLMError
            raise LLMError(f"Gemini request failed: {type(exc).__name__}") from exc

        if isinstance(response.parsed, schema):
            return response.parsed
        try:
            return schema.model_validate_json(response.text or "")
        except ValidationError as exc:
            raise LLMError(f"Gemini returned output that does not match {schema.__name__}") from exc
