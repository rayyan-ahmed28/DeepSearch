"""DeepSearch API.

Run from the backend folder:  uvicorn app.main:app --port 8000
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import routes, ws
from app.config import Settings, load_settings
from app.db.store import RunStore
from app.providers import LLMProvider
from app.graph.context import LiveWorkers
from app.runs import RunRegistry
from app.workers.market_data import PriceSource

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(
    settings: Settings | None = None,
    llm: LLMProvider | None = None,
    prices: PriceSource | None = None,
    live: LiveWorkers | None = None,
    store: RunStore | None = None,
) -> FastAPI:
    """Build the app. Tests pass their own LLM, price source, live workers and store; nothing else changes."""
    settings = settings or load_settings()
    app = FastAPI(title="DeepSearch API", version="0.2.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
    )
    app.state.registry = RunRegistry(settings, llm=llm, prices=prices, live=live, store=store)
    app.include_router(routes.router)
    app.include_router(ws.router)
    logging.getLogger("deepsearch").info(
        "DeepSearch API ready: demo_mode=%s llm=%s history=%s",
        settings.demo_mode, app.state.registry.llm.name, app.state.registry.store.path
    )
    return app


app = create_app()
