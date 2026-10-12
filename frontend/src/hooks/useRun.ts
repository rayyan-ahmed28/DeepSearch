import { useEffect, useState } from "react";

import { getHistoryEntry } from "@/lib/api";
import { isSampleRunId } from "@/lib/runConfig";
import { useRunStore, type RunRecord } from "@/store/runStore";

/**
 * The run for a research id. Dashboard sample ids (demo-1, ...) are created on
 * demand. Any other id this browser doesn't have is looked up in the backend's
 * saved history and opened from there; it is `missing` only if that fails.
 */
export function useRun(id: string): { run: RunRecord | undefined; missing: boolean } {
  const run = useRunStore((s) => s.runs[id]);
  const ensureSampleRun = useRunStore((s) => s.ensureSampleRun);
  const adoptBackendRun = useRunStore((s) => s.adoptBackendRun);
  const [notFound, setNotFound] = useState<string | null>(null);

  useEffect(() => {
    if (run) return;
    if (isSampleRunId(id)) {
      ensureSampleRun(id);
      return;
    }
    let cancelled = false;
    getHistoryEntry(id).then((entry) => {
      if (cancelled) return;
      if (entry && entry !== "missing") adoptBackendRun(entry);
      else setNotFound(id);
    });
    return () => {
      cancelled = true;
    };
  }, [id, run, ensureSampleRun, adoptBackendRun]);

  return { run, missing: !run && notFound === id };
}

/** Current time, refreshed every `intervalMs` while `active`. */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [active, intervalMs]);
  return active ? now : Date.now();
}
