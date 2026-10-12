/**
 * Event contract for the Research Execution screen.
 *
 * Shapes mirror backend `WSEvent` (app/models/schemas.py): `type` + `payload`.
 * The mock sequence below and the future WebSocket both emit `ExecEvent`,
 * so swapping mock -> live only changes the event source (see
 * hooks/useResearchStream.ts), not any component.
 *
 * Demo content is sample data only. Names are fictional and labeled as such.
 */

export type DomainName = "legal" | "finance";

export type AgentId =
  | "gateway"
  | "legal_manager"
  | "finance_manager"
  | "legal_records"
  | "web_research"
  | "financial_data"
  | "calculator"
  | "verification"
  | "report_architect";

export type AgentStatus = "idle" | "running" | "done" | "skipped" | "error";

export type LogLevel = "info" | "warn" | "error";

export type ClaimStatus = "verified" | "corroborated" | "unverified" | "conflicting";

export type ExecEvent =
  | { type: "domain_classified"; payload: { domains: DomainName[]; rationale: string } }
  | { type: "plan_created"; payload: { manager: DomainName; tasks: string[] } }
  | { type: "agent_status"; payload: { agent: AgentId; status: AgentStatus; detail?: string } }
  | { type: "activity_log"; payload: { agent: AgentId; message: string; level?: LogLevel; llm_call?: boolean } }
  | { type: "source_found"; payload: { title: string; source_type: string; retrieved_by: AgentId } }
  | { type: "claim_verified"; payload: { text: string; status: ClaimStatus } }
  | { type: "chart_ready"; payload: { title: string } }
  | { type: "report_ready"; payload: { research_id: string } }
  | { type: "error"; payload: { message: string } };

export interface AgentMeta {
  id: AgentId;
  label: string;
  /** "llm" agents spend an LLM call; "tool" agents are deterministic code. */
  kind: "llm" | "tool";
  x: number;
  y: number;
  r: number;
}

/** Node layout inside a 800x440 SVG viewBox. */
export const AGENTS: AgentMeta[] = [
  { id: "gateway", label: "Gateway Router", kind: "llm", x: 70, y: 220, r: 18 },
  { id: "legal_manager", label: "Legal Manager", kind: "llm", x: 235, y: 120, r: 18 },
  { id: "finance_manager", label: "Finance Manager", kind: "llm", x: 235, y: 320, r: 18 },
  { id: "legal_records", label: "Legal Records", kind: "tool", x: 420, y: 70, r: 14 },
  { id: "web_research", label: "Web Research", kind: "tool", x: 420, y: 170, r: 14 },
  { id: "financial_data", label: "Financial Data", kind: "tool", x: 420, y: 270, r: 14 },
  { id: "calculator", label: "Calculator", kind: "tool", x: 420, y: 370, r: 14 },
  { id: "verification", label: "Verification", kind: "llm", x: 590, y: 220, r: 18 },
  { id: "report_architect", label: "Report Architect", kind: "llm", x: 735, y: 220, r: 20 },
];

export const AGENT_LABEL: Record<AgentId, string> = Object.fromEntries(
  AGENTS.map((a) => [a.id, a.label]),
) as Record<AgentId, string>;

export const EDGES: [AgentId, AgentId][] = [
  ["gateway", "legal_manager"],
  ["gateway", "finance_manager"],
  ["legal_manager", "legal_records"],
  ["legal_manager", "web_research"],
  ["finance_manager", "web_research"],
  ["finance_manager", "financial_data"],
  ["finance_manager", "calculator"],
  ["legal_records", "verification"],
  ["web_research", "verification"],
  ["financial_data", "verification"],
  ["calculator", "verification"],
  ["verification", "report_architect"],
];

/** Target ceiling from the architecture plan (decision D9). */
export const LLM_CALL_BUDGET = 8;

export interface TimedEvent {
  /** ms since stream start */
  at: number;
  event: ExecEvent;
}

const st = (at: number, agent: AgentId, status: AgentStatus, detail?: string): TimedEvent => ({
  at,
  event: { type: "agent_status", payload: { agent, status, detail } },
});
const log = (at: number, agent: AgentId, message: string, llm_call = false, level: LogLevel = "info"): TimedEvent => ({
  at,
  event: { type: "activity_log", payload: { agent, message, llm_call, level } },
});
const src = (at: number, title: string, source_type: string, retrieved_by: AgentId): TimedEvent => ({
  at,
  event: { type: "source_found", payload: { title, source_type, retrieved_by } },
});
const claim = (at: number, text: string, status: ClaimStatus): TimedEvent => ({
  at,
  event: { type: "claim_verified", payload: { text, status } },
});

/**
 * Sample run: a fictional company with both a legal and a financial angle.
 * 7 LLM calls total (budget 8): router 1, managers 2, web research 2, verification 1, report 1.
 */
export const MOCK_SEQUENCE: TimedEvent[] = [
  // Gateway
  st(0, "gateway", "running", "Classifying domain"),
  log(200, "gateway", "Classifying query into legal / finance scope", true),
  { at: 1400, event: { type: "domain_classified", payload: { domains: ["legal", "finance"], rationale: "Query mentions both a regulatory dispute and stock impact." } } },
  st(1500, "gateway", "done"),

  // Managers plan (parallel)
  st(1700, "legal_manager", "running", "Planning legal tasks"),
  st(1700, "finance_manager", "running", "Planning financial tasks"),
  log(1800, "legal_manager", "Drafting legal research plan", true),
  log(1800, "finance_manager", "Drafting financial research plan", true),
  { at: 3000, event: { type: "plan_created", payload: { manager: "legal", tasks: ["Find court and regulator records", "Collect reputable news coverage", "Build case timeline"] } } },
  { at: 3100, event: { type: "plan_created", payload: { manager: "finance", tasks: ["Pull price history", "Pull company filings", "Compute event-window returns"] } } },
  st(3200, "legal_manager", "done"),
  st(3200, "finance_manager", "done"),

  // Workers (deterministic)
  st(3500, "legal_records", "running", "Querying court records"),
  st(3500, "web_research", "running", "Searching and compressing web sources"),
  st(3500, "financial_data", "running", "Fetching price history"),
  log(3600, "legal_records", "Searching court records API"),
  log(3700, "web_research", "Running multi-query web search", true),
  log(3800, "financial_data", "Fetching daily prices for the sample ticker"),
  src(4300, "Docket entry: Example Corp v. Regulator (sample)", "official_court", "legal_records"),
  src(4800, "Regulator press release (sample)", "regulatory", "web_research"),
  src(5200, "Example Corp annual filing, FY sample", "company", "financial_data"),
  log(5400, "financial_data", "Price history loaded: 252 trading days"),
  st(5500, "financial_data", "done"),
  st(5600, "calculator", "running", "Computing returns"),
  log(5700, "calculator", "Computing event-window returns with pandas"),
  src(6100, "Docket entry: motion ruling (sample)", "official_court", "legal_records"),
  src(6500, "Wire-service news report (sample)", "reputable_news", "web_research"),
  log(7000, "calculator", "Cumulative return and drawdown computed"),
  st(7100, "calculator", "done"),
  { at: 7200, event: { type: "chart_ready", payload: { title: "Price around event window" } } },
  src(7600, "Court order summary (sample)", "official_court", "legal_records"),
  log(7800, "legal_records", "Records retrieval complete"),
  st(7900, "legal_records", "done"),
  src(8600, "Company statement (sample)", "company", "web_research"),
  log(9000, "web_research", "Compressing retrieved pages", true),
  st(9600, "web_research", "done"),

  // Verification
  st(9900, "verification", "running", "Cross-checking claims"),
  log(10000, "verification", "Matching claims to sources by source hierarchy"),
  claim(10600, "Court order issued on a stated date", "verified"),
  claim(11100, "Regulator opened an inquiry", "corroborated"),
  claim(11600, "Company denies the allegation", "verified"),
  claim(12100, "Price moved after the ruling", "corroborated"),
  claim(12600, "Analyst estimate of impact", "unverified"),
  log(13000, "verification", "Summarizing verification results", true),
  st(13600, "verification", "done"),

  // Report
  st(13900, "report_architect", "running", "Composing report"),
  log(14000, "report_architect", "Choosing report sections for this query", true),
  log(16000, "report_architect", "Attaching citations to claims"),
  st(17400, "report_architect", "done"),
  { at: 17700, event: { type: "report_ready", payload: { research_id: "demo-1" } } },
];

export const MOCK_DURATION_MS = MOCK_SEQUENCE[MOCK_SEQUENCE.length - 1].at;
