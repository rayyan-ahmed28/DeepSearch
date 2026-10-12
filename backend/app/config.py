"""Settings, read from environment variables and backend/.env (if present).

Every key may be blank: the app then runs in Demo Mode with the rule-based
stand-in for the LLM. Key values are never logged or returned by the API.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Real environment variables win over the file.
load_dotenv(BACKEND_DIR / ".env", override=False)


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


@dataclass(frozen=True)
class Settings:
    llm_provider: str = "gemini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    demo_mode_setting: str = "auto"  # auto | true | false
    tavily_api_key: str = ""
    courtlistener_api_token: str = ""
    sec_edgar_user_agent: str = ""
    cors_origins: list[str] = field(default_factory=lambda: ["http://localhost:5173"])
    llm_call_budget: int = 8  # decision D9
    demo_pace_seconds: float = 0.8  # recorded runs replay at a watchable pace (0 in tests)
    # Saved history. load_settings() uses backend/deepsearch.db; tests keep it in memory.
    database_url: str = ":memory:"

    @property
    def has_gemini(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def demo_mode(self) -> bool:
        if self.demo_mode_setting == "true":
            return True
        if self.demo_mode_setting == "false":
            return False
        return not self.has_gemini  # auto: live only when the LLM key exists

    @property
    def effective_llm(self) -> str:
        """"gemini" when it is configured and Demo Mode is off, otherwise the rule-based "fake"."""
        if not self.demo_mode and self.llm_provider == "gemini" and self.has_gemini:
            return "gemini"
        return "fake"


def load_settings() -> Settings:
    origins = [o.strip() for o in _env("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
    return Settings(
        llm_provider=_env("LLM_PROVIDER", "gemini").lower(),
        gemini_api_key=_env("GEMINI_API_KEY"),
        gemini_model=_env("GEMINI_MODEL", "gemini-3.5-flash-lite"),
        demo_mode_setting=_env("DEMO_MODE", "auto").lower(),
        tavily_api_key=_env("TAVILY_API_KEY"),
        courtlistener_api_token=_env("COURTLISTENER_API_TOKEN"),
        sec_edgar_user_agent=_env("SEC_EDGAR_USER_AGENT"),
        cors_origins=origins,
        demo_pace_seconds=float(_env("DEMO_PACE_SECONDS", "0.8") or 0.8),
        database_url=_env("DATABASE_URL", "sqlite:///./deepsearch.db") or "sqlite:///./deepsearch.db",
    )
