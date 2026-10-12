"""A small in-memory rate limiter for starting runs (Phase 10).

Each run spends free-tier quota (Gemini, Tavily, CourtListener, Yahoo), so a
client may start only a few runs a minute. One process, no shared store: that
is enough for a local or single-server deployment.
"""

from __future__ import annotations

import math
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, limit: int, window_seconds: float = 60.0, clock=time.monotonic) -> None:
        self.limit = limit
        self.window = window_seconds
        self.clock = clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> int:
        """Record a hit for `key`. Returns 0 if allowed, else the seconds to wait."""
        now = self.clock()
        hits = self._hits[key]
        while hits and now - hits[0] >= self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            return max(1, math.ceil(self.window - (now - hits[0])))
        hits.append(now)
        return 0
