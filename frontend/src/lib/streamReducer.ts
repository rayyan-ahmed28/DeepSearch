import {
  AGENTS,
  EDGES,
  type AgentId,
  type AgentStatus,
  type ChartPayload,
  type ClaimPayload,
  type DomainName,
  type ExecEvent,
  type LogLevel,
  type SourcePayload,
  type TimelineEntry,
} from "@/lib/executionEvents";

export interface LogEntry {
  id: number;
  agent: AgentId | "system";
  message: string;
  level: LogLevel;
  llm: boolean;
}

export interface AgentState {
  status: AgentStatus;
  /** Short label while running, e.g. "Fetching price history". */
  detail?: string;
  /** Latest activity-log line from this agent. */
  lastLog?: string;
}

/** Everything a screen needs about one run, folded from its event stream. */
export interface StreamState {
  agents: Record<AgentId, AgentState>;
  domains: DomainName[];
  rationale: string | null;
  plans: Partial<Record<DomainName, string[]>>;
  logs: LogEntry[];
  sources: SourcePayload[];
  claims: ClaimPayload[];
  charts: ChartPayload[];
  timeline: TimelineEntry[];
  llmCalls: number;
  done: boolean;
  error: string | null;
}

export function initialStreamState(): StreamState {
  return {
    agents: Object.fromEntries(AGENTS.map((a) => [a.id, { status: "idle" as AgentStatus }])) as StreamState["agents"],
    domains: [],
    rationale: null,
    plans: {},
    logs: [],
    sources: [],
    claims: [],
    charts: [],
    timeline: [],
    llmCalls: 0,
    done: false,
    error: null,
  };
}

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

/** Replace an item with the same id, or append it (mirrors backend `merge_by_id`). */
function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const copy = list.slice();
  copy[i] = item;
  return copy;
}

/** Pure: safe for React StrictMode and for replaying a stored event list. */
export function streamReducer(state: StreamState, e: ExecEvent): StreamState {
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
    case "agent_status": {
      const prev = state.agents[e.payload.agent];
      return {
        ...state,
        agents: {
          ...state.agents,
          [e.payload.agent]: { ...prev, status: e.payload.status, detail: e.payload.detail },
        },
      };
    }
    case "activity_log": {
      const prev = state.agents[e.payload.agent];
      return {
        ...state,
        agents: { ...state.agents, [e.payload.agent]: { ...prev, lastLog: e.payload.message } },
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
    }
    case "source_found":
      return { ...state, sources: upsert(state.sources, e.payload) };
    case "claim_verified":
      return { ...state, claims: upsert(state.claims, e.payload) };
    case "chart_ready":
      return { ...state, charts: upsert(state.charts, e.payload) };
    case "timeline_ready":
      return { ...state, timeline: [...e.payload.events].sort((a, b) => a.date.localeCompare(b.date)) };
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
