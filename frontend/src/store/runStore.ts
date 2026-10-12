/**
 * Research runs, keyed by research id, shared by the Execution, Workspace and
 * Report screens. A run keeps going when you leave its page and survives a
 * reload. Two engines feed the same `streamReducer`:
 *
 * - backend: the FastAPI server runs the real pipeline and streams events
 *   over WS /ws/research/{id}. On reconnect the server replays the backlog
 *   after the last event we have (`?after=seq`).
 * - sample: the deterministic sample replay (lib/sampleRun.ts), used for the
 *   Dashboard samples and whenever the backend is not running. Only
 *   {config, startedAt, skipped} is saved; state is rebuilt by replaying.
 *
 * The backend also keeps every run in its saved history (SQLite). A backend
 * run that isn't in this browser (a link, another browser, a cleared cache)
 * is adopted from that history and its saved events replay over the socket.
 */
import { create } from "zustand";

import { RUN_NOT_FOUND_CLOSE_CODE, createResearch, researchSocketUrl, type HistoryEntry, type LlmProvider } from "@/lib/api";
import type { ExecEvent, TimedEvent } from "@/lib/executionEvents";
import { formatDate } from "@/lib/format";
import { DEFAULT_SAMPLE_QUERY, SAMPLE_RUNS, domainsForMode, type RunConfig } from "@/lib/runConfig";
import { buildMockSequence } from "@/lib/sampleRun";
import { initialStreamState, streamReducer, type StreamState } from "@/lib/streamReducer";

export type RunEngine =
  | { kind: "sample"; note?: string }
  // A recorded demo scenario (D21) is a backend run with llm "recorded".
  | { kind: "backend"; llm: LlmProvider; scenarioId?: string; dataAsOf?: string };

export interface RunRecord {
  id: string;
  config: RunConfig;
  engine: RunEngine;
  /** A fictional Dashboard sample, recreated on demand and never saved. */
  sample: boolean;
  startedAt: number;
  /** Backend runs: when the final event arrived. */
  finishedAt: number | null;
  /** Sample runs: the user pressed "Skip to end". */
  skipped: boolean;
  /** Sample runs: length of the replay. */
  durationMs: number;
  /** Backend runs: last event sequence number received. */
  lastSeq: number;
  state: StreamState;
}

interface RunStore {
  runs: Record<string, RunRecord>;
  /**
   * Starts on the backend if it is running, otherwise as a sample replay.
   * With a scenario id it replays that recorded scenario, and throws if the
   * backend is not running (a scenario never silently becomes the sample).
   */
  startRun: (config: RunConfig, scenarioId?: string) => Promise<string>;
  ensureSampleRun: (id: string) => void;
  /** Sample runs only. */
  restartRun: (id: string) => void;
  /** Sample runs only. */
  skipToEnd: (id: string) => void;
  /** Open a run from the backend's saved history in this browser. */
  adoptBackendRun: (entry: HistoryEntry) => void;
  /** Drop a run from this browser (after it was deleted from the history). */
  forgetRun: (id: string) => void;
}

// ── Persistence (localStorage may be missing, full or blocked) ─────
const STORAGE_KEY = "deepsearch.runs.v1";
const MAX_SAVED_RUNS = 20;

interface SavedRun {
  id: string;
  config: RunConfig;
  startedAt: number;
  skipped: boolean;
  engine?: RunEngine;
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
    .map(({ id, config, startedAt, skipped, engine }) => ({ id, config, startedAt, skipped, engine }));
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Private window or storage disabled: runs still work, they just won't survive a reload.
  }
}

function setRun(id: string, update: (run: RunRecord) => RunRecord) {
  useRunStore.setState((s) => {
    const run = s.runs[id];
    return run ? { runs: { ...s.runs, [id]: update(run) } } : s;
  });
}

// ── Sample replay driver ───────────────────────────────────────────
const timers = new Map<string, number[]>();

function clearTimers(id: string) {
  timers.get(id)?.forEach((t) => window.clearTimeout(t));
  timers.delete(id);
}

function fold(events: ExecEvent[]): StreamState {
  return events.reduce(streamReducer, initialStreamState());
}

/** Rebuild state up to "now" and schedule the rest of the sequence. */
function play(id: string, sequence: TimedEvent[], startedAt: number): StreamState {
  clearTimers(id);
  const elapsed = Date.now() - startedAt;
  const pending = sequence.filter((s) => s.at > elapsed);
  timers.set(
    id,
    pending.map((step) =>
      window.setTimeout(() => setRun(id, (run) => ({ ...run, state: streamReducer(run.state, step.event) })), step.at - elapsed),
    ),
  );
  return fold(sequence.filter((s) => s.at <= elapsed).map((s) => s.event));
}

function sampleRecord(
  id: string,
  config: RunConfig,
  opts: { sample: boolean; startedAt: number; skipped: boolean; note?: string },
): RunRecord {
  const sequence = buildMockSequence(domainsForMode(config.mode), config.mode !== "auto", id, config.query);
  const durationMs = sequence[sequence.length - 1].at;
  const state = opts.skipped ? fold(sequence.map((s) => s.event)) : play(id, sequence, opts.startedAt);
  return {
    id,
    config,
    engine: { kind: "sample", note: opts.note },
    sample: opts.sample,
    startedAt: opts.startedAt,
    finishedAt: null,
    skipped: opts.skipped,
    durationMs,
    lastSeq: 0,
    state,
  };
}

// ── Backend driver ─────────────────────────────────────────────────
interface ServerEvent {
  type: ExecEvent["type"];
  payload: unknown;
  seq?: number;
  timestamp?: string;
}

const sockets = new Map<string, WebSocket>();
const MAX_RECONNECTS = 4;

function applyServerEvent(id: string, event: ServerEvent) {
  setRun(id, (run) => {
    // seq 0 / missing = out-of-band (e.g. "run not on the server"): always apply.
    if (event.seq && event.seq <= run.lastSeq) return run; // already have it
    const at = event.timestamp ? Date.parse(event.timestamp) : Date.now();
    const terminal = event.type === "report_ready" || event.type === "error";
    return {
      ...run,
      lastSeq: event.seq || run.lastSeq,
      startedAt: event.seq === 1 && !Number.isNaN(at) ? at : run.startedAt,
      finishedAt: terminal ? at : run.finishedAt,
      state: streamReducer(run.state, event as ExecEvent),
    };
  });
}

function connect(id: string, attempt = 0) {
  const run = useRunStore.getState().runs[id];
  if (!run || run.engine.kind !== "backend") return;
  sockets.get(id)?.close();
  const ws = new WebSocket(researchSocketUrl(id, run.lastSeq));
  sockets.set(id, ws);

  ws.onmessage = (message) => {
    try {
      applyServerEvent(id, JSON.parse(message.data as string) as ServerEvent);
    } catch {
      // ignore a malformed message rather than break the run view
    }
  };
  ws.onclose = (closed) => {
    if (sockets.get(id) === ws) sockets.delete(id);
    const current = useRunStore.getState().runs[id];
    if (!current || current.state.done || current.state.error || closed.code === RUN_NOT_FOUND_CLOSE_CODE) return;
    if (attempt < MAX_RECONNECTS) {
      window.setTimeout(() => connect(id, attempt + 1), 1000 * (attempt + 1));
    } else {
      applyServerEvent(id, { type: "error", payload: { message: "Lost the connection to the backend. Is it still running?" } });
    }
  };
}

function backendRecord(id: string, config: RunConfig, engine: Extract<RunEngine, { kind: "backend" }>, startedAt: number): RunRecord {
  return {
    id,
    config,
    engine,
    sample: false,
    startedAt,
    finishedAt: null,
    skipped: false,
    durationMs: 0,
    lastSeq: 0,
    state: initialStreamState(),
  };
}

function newRunId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

// ── Store ──────────────────────────────────────────────────────────
export const useRunStore = create<RunStore>()((set, get) => ({
  runs: {},

  startRun: async (config, scenarioId) => {
    const clean: RunConfig = { ...config, query: config.query.trim() || DEFAULT_SAMPLE_QUERY };
    const created = await createResearch(clean, scenarioId);
    if (created.ok) {
      const { research_id: id, llm_provider, scenario } = created.run;
      const engine = { kind: "backend" as const, llm: llm_provider, scenarioId: scenario?.id, dataAsOf: scenario?.data_as_of };
      set((s) => ({ runs: { ...s.runs, [id]: backendRecord(id, clean, engine, Date.now()) } }));
      save(get().runs);
      connect(id);
      return id;
    }
    if (created.busy) throw new Error(created.reason);
    if (scenarioId) throw new Error(`${created.reason}: start the backend to replay the recorded scenarios.`);
    const id = newRunId();
    const record = sampleRecord(id, clean, { sample: false, startedAt: Date.now(), skipped: false, note: created.reason });
    set((s) => ({ runs: { ...s.runs, [id]: record } }));
    save(get().runs);
    return id;
  },

  ensureSampleRun: (id) => {
    const def = SAMPLE_RUNS[id];
    if (!def || get().runs[id]) return;
    const record = sampleRecord(id, def.config, { sample: true, startedAt: Date.now(), skipped: def.completed });
    set((s) => ({ runs: { ...s.runs, [id]: record } }));
  },

  restartRun: (id) => {
    const run = get().runs[id];
    if (!run || run.engine.kind !== "sample") return;
    const record = sampleRecord(id, run.config, { sample: run.sample, startedAt: Date.now(), skipped: false, note: run.engine.note });
    set((s) => ({ runs: { ...s.runs, [id]: record } }));
    save(get().runs);
  },

  skipToEnd: (id) => {
    const run = get().runs[id];
    if (!run || run.engine.kind !== "sample") return;
    clearTimers(id);
    const record = sampleRecord(id, run.config, { sample: run.sample, startedAt: run.startedAt, skipped: true, note: run.engine.note });
    set((s) => ({ runs: { ...s.runs, [id]: record } }));
    save(get().runs);
  },

  adoptBackendRun: (entry) => {
    const id = entry.research_id;
    if (get().runs[id]) return;
    const engine = {
      kind: "backend" as const,
      llm: entry.llm_provider,
      scenarioId: entry.scenario?.id,
      dataAsOf: entry.scenario?.data_as_of,
    };
    const config: RunConfig = { query: entry.query, mode: entry.mode, depth: entry.depth };
    const startedAt = Date.parse(entry.created_at) || Date.now();
    set((s) => ({ runs: { ...s.runs, [id]: backendRecord(id, config, engine, startedAt) } }));
    save(get().runs);
    connect(id);
  },

  forgetRun: (id) => {
    clearTimers(id);
    const socket = sockets.get(id);
    sockets.delete(id);
    socket?.close();
    set((s) => {
      const { [id]: _gone, ...rest } = s.runs;
      return { runs: rest };
    });
    save(get().runs);
  },
}));

// Restore saved runs once, when the app loads; backend runs reconnect and get their backlog.
const saved = loadSaved();
useRunStore.setState({
  runs: Object.fromEntries(
    saved.map((r) => [
      r.id,
      r.engine?.kind === "backend"
        ? backendRecord(r.id, r.config, r.engine, r.startedAt)
        : sampleRecord(r.id, r.config, { sample: false, startedAt: r.startedAt, skipped: r.skipped, note: r.engine?.note }),
    ]),
  ),
});
saved.filter((r) => r.engine?.kind === "backend").forEach((r) => connect(r.id));

// ── Helpers for screens ────────────────────────────────────────────
export function isRunActive(run: RunRecord): boolean {
  return !run.state.done && !run.state.error;
}

/** Elapsed run time in ms. A skipped sample counts as its full length. */
export function runElapsedMs(run: RunRecord, now: number): number {
  if (run.engine.kind === "backend") return Math.max(0, (run.finishedAt ?? now) - run.startedAt);
  if (run.skipped || run.state.done) return run.durationMs;
  return Math.min(Math.max(now - run.startedAt, 0), run.durationMs);
}

/** Where the price chart's data came from, for the caption under it. */
export function chartCaption(run: RunRecord): string {
  if (run.engine.kind === "sample") {
    return "Synthetic sample data for a fictional ticker. Dashed lines mark case events from the timeline.";
  }
  if (run.engine.llm === "recorded") {
    const asOf = run.engine.dataAsOf ? formatDate(run.engine.dataAsOf) : "the recording date";
    return `Daily closes from a Yahoo Finance snapshot taken ${asOf} (split-adjusted, so old prices won't match news quotes from the time). Every figure was recomputed in code from this series during the replay; dashed lines mark case events.`;
  }
  return "Daily closes from Yahoo Finance via yfinance (split-adjusted). Every figure here was computed in code from this series.";
}

/** How to describe where a run's events come from, honestly. */
export function engineLabel(run: RunRecord): { badge: string; line: string } {
  if (run.engine.kind === "backend" && run.engine.llm === "recorded") {
    const asOf = run.engine.dataAsOf ? formatDate(run.engine.dataAsOf) : "the recording date";
    return {
      badge: `Recorded demo · data as of ${asOf}`,
      line: `Recorded demo run · real sources and prices as of ${asOf}, replayed through the live pipeline`,
    };
  }
  if (run.engine.kind === "backend") {
    return run.engine.llm === "gemini"
      ? { badge: "Backend run · Gemini", line: "Backend run · live data · Gemini" }
      : { badge: "Backend run · Rule-based stand-in", line: "Backend run · live data · rule-based stand-in for the LLM (no Gemini key)" };
  }
  const note = run.engine.note ? ` (${run.engine.note})` : "";
  return { badge: "Demo replay · Sample data", line: `Demo replay of sample events${note}` };
}
