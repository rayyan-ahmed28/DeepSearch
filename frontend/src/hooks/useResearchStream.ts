import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  AGENTS,
  EDGES,
  buildMockSequence,
  type AgentId,
  type AgentStatus,
  type ClaimStatus,
  type DomainName,
  type ExecEvent,
  type LogLevel,
} from "@/lib/executionEvents";

export interface LogEntry {
  id: number;
  agent: AgentId | "system";
  message: string;
  level: LogLevel;
  llm: boolean;
}

export interface SourceEntry {
  title: string;
  source_type: string;
  retrieved_by: AgentId;
}

export interface ClaimEntry {
  text: string;
  status: ClaimStatus;
}

export interface StreamState {
  agents: Record<AgentId, { status: AgentStatus; detail?: string }>;
  domains: DomainName[];
  rationale: string | null;
  plans: Partial<Record<DomainName, string[]>>;
  logs: LogEntry[];
  sources: SourceEntry[];
  claims: ClaimEntry[];
  charts: number;
  llmCalls: number;
  done: boolean;
  error: string | null;
}

function initialAgents(): StreamState["agents"] {
  return Object.fromEntries(AGENTS.map((a) => [a.id, { status: "idle" as AgentStatus }])) as StreamState["agents"];
}

const initialState: StreamState = {
  agents: initialAgents(),
  domains: [],
  rationale: null,
  plans: {},
  logs: [],
  sources: [],
  claims: [],
  charts: 0,
  llmCalls: 0,
  done: false,
  error: null,
};

type Action = { type: "reset" } | { type: "event"; event: ExecEvent };

/**
 * Managers for unselected domains are skipped, and so is any worker whose
 * managers were all skipped (e.g. Legal Records on a Finance-only run).
 * AGENTS is in graph order, so parents are settled before their children.
 */
function applyDomainSkips(agents: StreamState["agents"], domains: DomainName[]): StreamState["agents"] {
  const next = { ...agents };
  if (!domains.includes("legal")) next.legal_manager = { status: "skipped" };
  if (!domains.includes("finance")) next.finance_manager = { status: "skipped" };
  for (const a of AGENTS) {
    const parents = EDGES.filter(([, to]) => to === a.id).map(([from]) => from);
    if (parents.length > 0 && parents.every((p) => next[p].status === "skipped")) {
      next[a.id] = { status: "skipped" };
    }
  }
  return next;
}

function reducer(state: StreamState, action: Action): StreamState {
  if (action.type === "reset") return { ...initialState, agents: initialAgents() };

  const e = action.event;
  switch (e.type) {
    case "domain_classified":
      return {
        ...state,
        agents: applyDomainSkips(state.agents, e.payload.domains),
        domains: e.payload.domains,
        rationale: e.payload.rationale,
      };
    case "plan_created":
      return { ...state, plans: { ...state.plans, [e.payload.manager]: e.payload.tasks } };
    case "agent_status":
      return {
        ...state,
        agents: { ...state.agents, [e.payload.agent]: { status: e.payload.status, detail: e.payload.detail } },
      };
    case "activity_log":
      return {
        ...state,
        llmCalls: state.llmCalls + (e.payload.llm_call ? 1 : 0),
        logs: [
          ...state.logs,
          {
            id: state.logs.length,
            agent: e.payload.agent,
            message: e.payload.message,
            level: e.payload.level ?? "info",
            llm: !!e.payload.llm_call,
          },
        ],
      };
    case "source_found":
      return { ...state, sources: [...state.sources, e.payload] };
    case "claim_verified":
      return { ...state, claims: [...state.claims, e.payload] };
    case "chart_ready":
      return { ...state, charts: state.charts + 1 };
    case "report_ready":
      return { ...state, done: true };
    case "error":
      return {
        ...state,
        error: e.payload.message,
        logs: [
          ...state.logs,
          { id: state.logs.length, agent: "system", message: e.payload.message, level: "error", llm: false },
        ],
      };
  }
}

/**
 * Event source for the execution screen.
 *
 * Today: replays the sample run (trimmed to `domains`) on timers.
 * Later: replace `start()` internals with a WebSocket to /ws/research/{id}
 * that calls `dispatch({ type: "event", event })` per message. Nothing else
 * in the UI changes.
 */
export function useResearchStream(domains: DomainName[], manualOverride: boolean) {
  const domainKey = domains.join(",");
  const sequence = useMemo(
    () => buildMockSequence(domainKey.split(",") as DomainName[], manualOverride),
    [domainKey, manualOverride],
  );
  const durationMs = sequence[sequence.length - 1].at;

  const [state, dispatch] = useReducer(reducer, initialState);
  const [elapsedMs, setElapsedMs] = useState(0);
  const timers = useRef<number[]>([]);
  const startedAt = useRef(0);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const start = useCallback(() => {
    clearTimers();
    dispatch({ type: "reset" });
    startedAt.current = Date.now();
    setElapsedMs(0);
    sequence.forEach((step) => {
      timers.current.push(window.setTimeout(() => dispatch({ type: "event", event: step.event }), step.at));
    });
  }, [clearTimers, sequence]);

  const skipToEnd = useCallback(() => {
    clearTimers();
    dispatch({ type: "reset" });
    sequence.forEach((step) => dispatch({ type: "event", event: step.event }));
    setElapsedMs(durationMs);
  }, [clearTimers, sequence, durationMs]);

  useEffect(() => {
    start();
    return clearTimers;
  }, [start, clearTimers]);

  useEffect(() => {
    if (state.done) return;
    const t = window.setInterval(() => setElapsedMs(Date.now() - startedAt.current), 250);
    return () => window.clearInterval(t);
  }, [state.done]);

  return { state, elapsedMs, restart: start, skipToEnd };
}
