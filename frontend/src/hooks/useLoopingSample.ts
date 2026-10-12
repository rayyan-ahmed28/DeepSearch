import { useEffect, useState } from "react";

import { DEFAULT_SAMPLE_QUERY } from "@/lib/runConfig";
import { buildMockSequence } from "@/lib/sampleRun";
import { initialStreamState, streamReducer, type StreamState } from "@/lib/streamReducer";

const PAUSE_AT_END_MS = 5000;

/**
 * The fictional sample run, replayed on a loop (Landing page hero). It lives
 * only in this component: nothing is added to the run store or history.
 */
export function useLoopingSample(): StreamState {
  const [state, setState] = useState<StreamState>(initialStreamState);
  const [round, setRound] = useState(0);

  useEffect(() => {
    const sequence = buildMockSequence(["legal", "finance"], false, "landing-sample", DEFAULT_SAMPLE_QUERY);
    setState(initialStreamState());
    const timers = sequence.map((step) => window.setTimeout(() => setState((s) => streamReducer(s, step.event)), step.at));
    const end = sequence[sequence.length - 1].at;
    timers.push(window.setTimeout(() => setRound((r) => r + 1), end + PAUSE_AT_END_MS));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [round]);

  return state;
}
