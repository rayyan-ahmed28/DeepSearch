/**
 * Research runs, keyed by research id, shared by the Execution, Workspace and
 * Report screens. A run keeps going when you leave its page, and survives a
 * reload: the sample replay is deterministic, so only {config, startedAt,
 * skipped} is saved and the state is rebuilt by replaying events up to now.
 *
 * When the backend exists, `play` is replaced by a WebSocket to
 * /ws/research/{id} that feeds the same `streamReducer`; the backend replays
 * its event backlog on connect, so reloads work the same way.
 */
import { create } from "zustand";

import type { ExecEvent, TimedEvent } from "@/lib/executionEvents";
import { DEFAULT_SAMPLE_QUERY, SAMPLE_RUNS, domainsForMode, type RunConfig } from "@/lib/runConfig";
import { buildMockSequence } from "@/lib/sampleRun";
import { initialStreamState, streamReducer, type StreamState } from "@/lib/streamReducer";

export interface RunRecord {
  id: string;
  config: RunConfig;
  /** A fictional Dashboard sample, recreated on demand and never saved. */
  sample: boolean;
  startedAt: number;
  /** The user pressed "Skip to end". */
  skipped: boolean;
  durationMs: number;
  state: StreamState;
}

interface RunStore {
  runs: Record<string, RunRecord>;
  startRun: (config: RunConfig) => string;
  ensureSampleRun: (id: string) => void;
  restartRun: (id: string) => void;
  skipToEnd: (id: string) => void;
}

// ── Persistence (localStorage may be missing, full or blocked) ─────
const STORAGE_KEY = "deepsearch.runs.v1";
const MAX_SAVED_RUNS = 20;

interface SavedRun {
  id: string;
  config: RunConfig;
  startedAt: number;
  skipped: boolean;
}

function loadSaved(): SavedRun[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as SavedRun[]).filter((r) => r && typeof r.id === "string" && r.config) : [];
  } catch {
    return [];
  }
}

function save(runs: Record<string, RunRecord>) {
  const saved: SavedRun[] = Object.values(runs)
    .filter((r) => !r.sample)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, MAX_SAVED_RUNS)
    .map(({ id, config, startedAt, skipped }) => ({ id, config, startedAt, skipped }));
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Private window or storage disabled: runs still work, they just won't survive a reload.
  }
}

// ── Sample replay driver ───────────────────────────────────────────
const timers = new Map<string, number[]>();

function clearTimers(id: string) {
  timers.get(id)?.forEach((t) => window.clearTimeout(t));
  timers.delete(id);
}

function sequenceFor(id: string, config: RunConfig): TimedEvent[] {
  return buildMockSequence(domainsForMode(config.mode), config.mode !== "auto", id);
}

function fold(events: ExecEvent[]): StreamState {
  return events.reduce(streamReducer, initialStreamState());
}

function applyEvent(id: string, event: ExecEvent) {
  useRunStore.setState((s) => {
    const run = s.runs[id];
    if (!run) return s;
    return { runs: { ...s.runs, [id]: { ...run, state: streamReducer(run.state, event) } } };
  });
}

/** Rebuild state up to "now" and schedule the rest of the sequence. */
function play(id: string, sequence: TimedEvent[], startedAt: number): StreamState {
  clearTimers(id);
  const elapsed = Date.now() - startedAt;
  const past = sequence.filter((s) => s.at <= elapsed);
  const pending = sequence.filter((s) => s.at > elapsed);
  timers.set(
    id,
    pending.map((step) => window.setTimeout(() => applyEvent(id, step.event), step.at - elapsed)),
  );
  return fold(past.map((s) => s.event));
}

function makeRecord(id: string, config: RunConfig, opts: { sample: boolean; startedAt: number; skipped: boolean }): RunRecord {
  const sequence = sequenceFor(id, config);
  const durationMs = sequence[sequence.length - 1].at;
  const state = opts.skipped ? fold(sequence.map((s) => s.event)) : play(id, sequence, opts.startedAt);
  return { id, config, ...opts, durationMs, state };
}

function newRunId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export const useRunStore = create<RunStore>()((set, get) => ({
  runs: {},

  startRun: (config) => {
    const id = newRunId();
    const clean: RunConfig = { ...config, query: config.query.trim() || DEFAULT_SAMPLE_QUERY };
    const record = makeRecord(id, clean, { sample: false, startedAt: Date.now(), skipped: false });
    set((s) => ({ runs: { ...s.runs, [id]: record } }));
    save(get().runs);
    return id;
  },

  ensureSampleRun: (id) => {
    const def = SAMPLE_RUNS[id];
    if (!def || get().runs[id]) return;
    const record = makeRecord(id, def.config, { sample: true, startedAt: Date.now(), skipped: def.completed });
    set((s) => ({ runs: { ...s.runs, [id]: record } }));
  },

  restartRun: (id) => {
    const run = get().runs[id];
    if (!run) return;
    const record = makeRecord(id, run.config, { sample: run.sample, startedAt: Date.now(), skipped: false });
    set((s) => ({ runs: { ...s.runs, [id]: record } }));
    save(get().runs);
  },

  skipToEnd: (id) => {
    const run = get().runs[id];
    if (!run) return;
    clearTimers(id);
    const record = makeRecord(id, run.config, { sample: run.sample, startedAt: run.startedAt, skipped: true });
    set((s) => ({ runs: { ...s.runs, [id]: record } }));
    save(get().runs);
  },
}));

// Restore saved runs once, when the app loads.
const restored = Object.fromEntries(
  loadSaved().map((r) => [r.id, makeRecord(r.id, r.config, { sample: false, startedAt: r.startedAt, skipped: r.skipped })]),
);
useRunStore.setState({ runs: restored });

/** Elapsed run time in ms; a skipped run counts as its full sample length. */
export function runElapsedMs(run: RunRecord, now: number): number {
  if (run.skipped || run.state.done) return run.durationMs;
  return Math.min(Math.max(now - run.startedAt, 0), run.durationMs);
}
