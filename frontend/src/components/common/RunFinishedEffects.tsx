import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useRunStore } from "@/store/runStore";
import { playChime, useSettings } from "@/store/settingsStore";

// A run whose last event is older than this was finished before we looked
// (e.g. reopened from history), so it doesn't chime or jump to its report.
const JUST_FINISHED_MS = 15_000;

/** Settings → Run behaviour: chime and open the report when a run you are watching finishes. */
export default function RunFinishedEffects() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = useRef(location.pathname);
  path.current = location.pathname;

  useEffect(
    () =>
      useRunStore.subscribe((now, before) => {
        for (const [id, run] of Object.entries(now.runs)) {
          const previous = before.runs[id];
          if (!previous || previous.state.done || !run.state.done) continue;
          if (Date.now() - (run.finishedAt ?? Date.now()) > JUST_FINISHED_MS) continue;
          const { chime, autoOpenReport } = useSettings.getState();
          if (chime) playChime();
          if (autoOpenReport && path.current === `/research/${id}`) navigate(`/research/${id}/report`);
        }
      }),
    [navigate],
  );
  return null;
}
