"""Per-run event bus: agents publish, WebSocket clients subscribe.

The bus keeps the run's full event history. A client that connects late, or
reconnects after a page reload, first receives the backlog (events with
`seq > after`) and then live events, so nothing is lost.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

from app.models.schemas import WSEvent


class EventBus:
    def __init__(self) -> None:
        self.history: list[WSEvent] = []
        self.closed = False
        self._subscribers: set[asyncio.Queue[WSEvent | None]] = set()

    def publish(self, type_: str, payload: dict[str, Any]) -> WSEvent:
        if self.closed:
            raise RuntimeError("Cannot publish to a closed event bus")
        event = WSEvent(type=type_, payload=payload, seq=len(self.history) + 1)
        self.history.append(event)
        for queue in self._subscribers:
            queue.put_nowait(event)
        return event

    def close(self) -> None:
        """Mark the run finished; subscribers drain and stop."""
        if self.closed:
            return
        self.closed = True
        for queue in self._subscribers:
            queue.put_nowait(None)

    async def stream(self, after: int = 0) -> AsyncIterator[WSEvent]:
        # Snapshot the backlog and subscribe with no await in between, so no
        # event can slip between the two (asyncio runs this atomically).
        queue: asyncio.Queue[WSEvent | None] = asyncio.Queue()
        backlog = [e for e in self.history if e.seq > after]
        already_closed = self.closed
        self._subscribers.add(queue)
        try:
            last = after
            for event in backlog:
                last = event.seq
                yield event
            if already_closed:
                return
            while True:
                event = await queue.get()
                if event is None:
                    return
                if event.seq > last:  # skip anything the backlog already covered
                    last = event.seq
                    yield event
        finally:
            self._subscribers.discard(queue)
