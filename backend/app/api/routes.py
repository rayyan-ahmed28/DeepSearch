"""REST endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel

from app.models.schemas import ResearchRequest
from app.runs import Run, RunInProgress, RunRegistry, UnknownScenario

router = APIRouter(prefix="/api")


def _registry(request: Request) -> RunRegistry:
    return request.app.state.registry


def _run_or_404(registry: RunRegistry, research_id: str) -> Run:
    run = registry.get(research_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found (it may have been deleted)")
    return run


class SavedUpdate(BaseModel):
    saved: bool


@router.get("/health")
def health(request: Request) -> dict:
    """Mode and which providers are configured. Never returns key values."""
    registry = _registry(request)
    s = registry.settings
    return {
        "status": "ok",
        "version": request.app.version,
        "demo_mode": s.demo_mode,
        "llm_provider": registry.llm.name,
        "llm_model": s.gemini_model if registry.llm.name == "gemini" else None,
        "llm_call_budget": s.llm_call_budget,
        "web_search": registry.live.web.name if registry.live.web else None,
        "providers": {
            "gemini": s.has_gemini,
            "tavily": bool(s.tavily_api_key),
            "courtlistener": bool(s.courtlistener_api_token),
            "sec_edgar": bool(s.sec_edgar_user_agent),
        },
        "scenarios": len(registry.scenarios),
        "history_runs": registry.store.count(),
    }


@router.get("/demo/scenarios")
def demo_scenarios(request: Request) -> list[dict]:
    """Recorded demo runs (D21) that replay through the live pipeline."""
    return [
        {
            "id": s.id,
            "title": s.title,
            "description": s.description,
            "query": s.query,
            "domains": [d.value for d in s.responses.route.domains],
            "data_as_of": s.data_as_of.isoformat(),
        }
        for s in _registry(request).scenarios.values()
    ]


@router.post("/research", status_code=201)
async def create_research(body: ResearchRequest, request: Request) -> dict:
    # async on purpose: the run is started as a task on the server's event loop.
    registry = _registry(request)
    try:
        run = registry.start(body)
    except UnknownScenario:
        raise HTTPException(status_code=404, detail=f"Unknown demo scenario: {body.scenario_id}")
    return {
        "research_id": run.state.research_id,
        "llm_provider": "recorded" if run.scenario else registry.llm.name,
        "demo_mode": run.state.demo_mode,
        "scenario": {"id": run.scenario.id, "data_as_of": run.scenario.data_as_of.isoformat()} if run.scenario else None,
    }


@router.get("/research")
def list_research(
    request: Request, saved: bool = False, limit: int = Query(default=50, ge=1, le=200)
) -> list[dict]:
    """Research history, newest first (only saved reports with ?saved=true)."""
    return _registry(request).history(saved_only=saved, limit=limit)


@router.get("/research/{research_id}")
def get_research(research_id: str, request: Request) -> dict:
    """The run's history entry (question, settings, status, saved) plus any errors."""
    registry = _registry(request)
    state = _run_or_404(registry, research_id).state
    summary = registry.summary(research_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="Run not found (it may have been deleted)")
    return {**summary, "errors": state.errors}


@router.patch("/research/{research_id}")
def update_research(research_id: str, body: SavedUpdate, request: Request) -> dict:
    """Save a finished report to Saved Reports, or remove it from there."""
    try:
        summary = _registry(request).set_saved(research_id, body.saved)
    except RunInProgress as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    if summary is None:
        raise HTTPException(status_code=404, detail="Run not found (it may have been deleted)")
    return summary


@router.delete("/research/{research_id}", status_code=204)
def delete_research(research_id: str, request: Request) -> Response:
    """Remove a finished run from the history for good."""
    try:
        deleted = _registry(request).delete(research_id)
    except RunInProgress as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    if not deleted:
        raise HTTPException(status_code=404, detail="Run not found (it may have been deleted)")
    return Response(status_code=204)


@router.get("/research/{research_id}/report")
def get_report(research_id: str, request: Request) -> dict:
    state = _run_or_404(_registry(request), research_id).state
    if state.report is None:
        raise HTTPException(status_code=409, detail="The report is not ready yet")
    return state.report.model_dump(mode="json")
