import { useCallback, useEffect, useState } from "react";

import { fetchHealth, type Health } from "@/lib/api";

type Snapshot = { health: Health; latencyMs: number } | null;

// One shared, short-lived cache, so every screen's badge doesn't hit the backend separately.
let cached: { at: number; value: Snapshot } | null = null;
let inflight: Promise<Snapshot> | null = null;
const listeners = new Set<(s: Snapshot) => void>();
const FRESH_MS = 15_000;

async function load(force: boolean): Promise<Snapshot> {
  if (!force && cached && Date.now() - cached.at < FRESH_MS) return cached.value;
  inflight ??= fetchHealth().finally(() => {
    inflight = null;
  });
  const value = await inflight;
  cached = { at: Date.now(), value };
  listeners.forEach((l) => l(value));
  return value;
}

/**
 * The backend's health: `undefined` while checking, `null` if it isn't running.
 * `refresh()` checks again now (Settings' "Test connection").
 */
export function useBackendHealth(): { snapshot: Snapshot | undefined; refresh: () => Promise<void> } {
  const [snapshot, setSnapshot] = useState<Snapshot | undefined>(cached?.value);
  useEffect(() => {
    listeners.add(setSnapshot);
    load(false).then(setSnapshot);
    return () => {
      listeners.delete(setSnapshot);
    };
  }, []);
  const refresh = useCallback(async () => {
    setSnapshot(undefined);
    await load(true);
  }, []);
  return { snapshot, refresh };
}
