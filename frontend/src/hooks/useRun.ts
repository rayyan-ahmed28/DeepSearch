import { useEffect, useState } from "react";

import { isSampleRunId } from "@/lib/runConfig";
import { useRunStore, type RunRecord } from "@/store/runStore";

/**
 * The run for a research id. Dashboard sample ids (demo-1, ...) are created on
 * demand; any other unknown id is `missing` (e.g. a link from another browser).
 */
export function useRun(id: string): { run: RunRecord | undefined; missing: boolean } {
  const run = useRunStore((s) => s.runs[id]);
  const ensureSampleRun = useRunStore((s) => s.ensureSampleRun);

  useEffect(() => {
    if (!run) ensureSampleRun(id);
  }, [id, run, ensureSampleRun]);

  return { run, missing: !run && !isSampleRunId(id) };
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
