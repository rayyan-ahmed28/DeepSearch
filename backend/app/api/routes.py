"""REST endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.models.schemas import ResearchRequest
from app.runs import Run, RunRegistry

router = APIRouter(prefix="/api")


def _registry(request: Request) -> RunRegistry:
    return request.app.state.registry


def _run_or_404(registry: RunRegistry, research_id: str) -> Run:
    run = registry.get(research_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found (the server may have been restarted)")
    return run


@router.get("/health")
def health(request: Request) -> dict:
    """Mode and which providers are configured. Never returns key values."""
    registry = _registry(request)
    s = registry.settings
    return {
        "status": "ok",
        "demo_mode": s.demo_mode,
        "llm_provider": registry.llm.name,
        "providers": {
            "gemini": s.has_gemini,
            "tavily": bool(s.tavily_api_key),
            "courtlistener": bool(s.courtlistener_api_token),
        },
    }


@router.post("/research", status_code=201)
async def create_research(body: ResearchRequest, request: Request) -> dict:
    # async on purpose: the run is started as a task on the server's event loop.
    registry = _registry(request)
    run = registry.start(body)
    return {
        "research_id": run.state.research_id,
        "llm_provider": registry.llm.name,
        "demo_mode": run.state.demo_mode,
    }


@router.get("/research/{research_id}")
def get_research(research_id: str, request: Request) -> dict:
    state = _run_or_404(_registry(request), research_id).state
    return {
        "research_id": state.research_id,
        "user_query": state.user_query,
        "mode_override": state.mode_override,
        "depth": state.depth,
        "detected_domains": state.detected_domains,
        "execution_status": state.execution_status,
        "errors": state.errors,
        "created_at": state.created_at,
    }


@router.get("/research/{research_id}/report")
def get_report(research_id: str, request: Request) -> dict:
    state = _run_or_404(_registry(request), research_id).state
    if state.report is None:
        raise HTTPException(status_code=409, detail="The report is not ready yet")
    return state.report.model_dump(mode="json")
