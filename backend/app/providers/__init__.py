from app.config import Settings
from app.providers.base import BudgetExceeded, CallCounter, LLMError, LLMProvider
from app.providers.fake import FakeLLMProvider


def build_provider(settings: Settings) -> LLMProvider:
    """Gemini when configured and Demo Mode is off; otherwise the rule-based stand-in."""
    if settings.effective_llm == "gemini":
        from app.providers.gemini import GeminiProvider

        return GeminiProvider(settings.gemini_api_key, settings.gemini_model)
    return FakeLLMProvider()


__all__ = ["BudgetExceeded", "CallCounter", "FakeLLMProvider", "LLMError", "LLMProvider", "build_provider"]
