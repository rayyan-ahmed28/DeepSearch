import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  AGENTS,
  MOCK_DURATION_MS,
  MOCK_SEQUENCE,
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

function reducer(state: StreamState, action: Action): StreamState {
  if (action.type === "reset") return { ...initialState, agents: initialAgents() };

  const e = action.event;
  switch (e.type) {
    case "domain_classified": {
      const agents = { ...state.agents };
      // Manager for a domain that was not selected is skipped, not idle.
      if (!e.payload.domains.includes("legal")) agents.legal_manager = { status: "skipped" };
      if (!e.payload.domains.includes("finance")) agents.finance_manager = { status: "skipped" };
      return { ...state, agents, domains: e.payload.domains, rationale: e.payload.rationale };
    }
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
 * Today: replays MOCK_SEQUENCE on timers.
 * Later: replace `start()` internals with a WebSocket to /ws/research/{id}
 * that calls `dispatch({ type: "event", event })` per message. Nothing else
 * in the UI changes.
 */
export function useResearchStream() {
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
    MOCK_SEQUENCE.forEach((step) => {
      timers.current.push(window.setTimeout(() => dispatch({ type: "event", event: step.event }), step.at));
    });
  }, [clearTimers]);

  const skipToEnd = useCallback(() => {
    clearTimers();
    dispatch({ type: "reset" });
    MOCK_SEQUENCE.forEach((step) => dispatch({ type: "event", event: step.event }));
    setElapsedMs(MOCK_DURATION_MS);
  }, [clearTimers]);

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
