"""WS /ws/research/{id}: the run's events, backlog first, then live.

`?after=<seq>` skips events the client already has (used when reconnecting).
"""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.models.schemas import WSEvent

router = APIRouter()

RUN_NOT_FOUND = 4404  # application close code


@router.websocket("/ws/research/{research_id}")
async def research_events(websocket: WebSocket, research_id: str, after: int = 0) -> None:
    await websocket.accept()
    run = websocket.app.state.registry.get(research_id)
    if run is None:
        missing = WSEvent(type="error", payload={"message": "This run is not on the server (it may have been restarted)."})
        await websocket.send_json(missing.model_dump(mode="json"))
        await websocket.close(code=RUN_NOT_FOUND)
        return
    try:
        async for event in run.bus.stream(after=after):
            await websocket.send_json(event.model_dump(mode="json"))
        await websocket.close()
    except WebSocketDisconnect:
        pass  # the browser left; the run carries on and can be rejoined
