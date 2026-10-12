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
  /**
   * "llm" agents spend an LLM call; "tool" agents are deterministic code;
   * "hybrid" uses one LLM call to extract claims, then deterministic rules
   * decide every verification status (the LLM never sets a status).
   */
  kind: "llm" | "tool" | "hybrid";
  x: number;
  y: number;
  r: number;
}

/** Node layout inside a 800x440 SVG viewBox. Listed in graph order (parents before children). */
export const AGENTS: AgentMeta[] = [
  { id: "gateway", label: "Gateway Router", kind: "llm", x: 70, y: 220, r: 18 },
  { id: "legal_manager", label: "Legal Manager", kind: "llm", x: 235, y: 120, r: 18 },
  { id: "finance_manager", label: "Finance Manager", kind: "llm", x: 235, y: 320, r: 18 },
  { id: "legal_records", label: "Legal Records", kind: "tool", x: 420, y: 70, r: 14 },
  { id: "web_research", label: "Web Research", kind: "tool", x: 420, y: 170, r: 14 },
  { id: "financial_data", label: "Financial Data", kind: "tool", x: 420, y: 270, r: 14 },
  { id: "calculator", label: "Calculator", kind: "tool", x: 420, y: 370, r: 14 },
  { id: "verification", label: "Verification", kind: "hybrid", x: 590, y: 220, r: 18 },
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

/**
 * Which runs an event belongs to: a single domain, "both" (only when Legal and
 * Finance run together), or untagged (every run).
 */
type Scope = DomainName | "both" | undefined;

interface ScopedEvent extends TimedEvent {
  scope?: Scope;
}

const st = (at: number, agent: AgentId, status: AgentStatus, detail?: string, scope?: Scope): ScopedEvent => ({
  at,
  scope,
  event: { type: "agent_status", payload: { agent, status, detail } },
});
const log = (at: number, agent: AgentId, message: string, llm_call = false, scope?: Scope): ScopedEvent => ({
  at,
  scope,
  event: { type: "activity_log", payload: { agent, message, llm_call, level: "info" } },
});
const src = (at: number, title: string, source_type: string, retrieved_by: AgentId, scope?: Scope): ScopedEvent => ({
  at,
  scope,
  event: { type: "source_found", payload: { title, source_type, retrieved_by } },
});
const claim = (at: number, text: string, status: ClaimStatus, scope?: Scope): ScopedEvent => ({
  at,
  scope,
  event: { type: "claim_verified", payload: { text, status } },
});

/**
 * Sample run: a fictional company with both a legal and a financial angle.
 * LLM calls on the combined run: router 1, managers 2, web research sub-queries
 * 2 (one per manager), verification claim extraction 1, report 1 = 7 of 8.
 * Page compression in web research is embedding-based, so it is not counted.
 */
const SAMPLE_RUN: ScopedEvent[] = [
  // Gateway
  st(0, "gateway", "running", "Classifying domain"),
  log(200, "gateway", "Classifying query into legal / finance scope", true),
  // domain_classified is inserted at 1400 by buildMockSequence
  st(1500, "gateway", "done"),

  // Managers plan (parallel)
  st(1700, "legal_manager", "running", "Planning legal tasks", "legal"),
  st(1700, "finance_manager", "running", "Planning financial tasks", "finance"),
  log(1800, "legal_manager", "Drafting legal research plan", true, "legal"),
  log(1800, "finance_manager", "Drafting financial research plan", true, "finance"),
  { at: 3000, scope: "legal", event: { type: "plan_created", payload: { manager: "legal", tasks: ["Find court and regulator records", "Collect reputable news coverage", "Build case timeline"] } } },
  { at: 3100, scope: "finance", event: { type: "plan_created", payload: { manager: "finance", tasks: ["Pull price history", "Pull company filings", "Compute event-window returns"] } } },
  st(3200, "legal_manager", "done", undefined, "legal"),
  st(3200, "finance_manager", "done", undefined, "finance"),

  // Workers (deterministic)
  st(3500, "legal_records", "running", "Querying court records", "legal"),
  st(3500, "web_research", "running", "Searching and compressing web sources"),
  st(3500, "financial_data", "running", "Fetching price history", "finance"),
  log(3600, "legal_records", "Searching court records API", false, "legal"),
  log(3700, "web_research", "Generating search sub-queries for the legal tasks", true, "legal"),
  log(3750, "web_research", "Generating search sub-queries for the financial tasks", true, "finance"),
  log(3800, "financial_data", "Fetching daily prices for the sample ticker", false, "finance"),
  src(4300, "Docket entry: Example Corp v. Regulator (sample)", "official_court", "legal_records", "legal"),
  src(4800, "Regulator press release (sample)", "regulatory", "web_research", "legal"),
  src(5200, "Example Corp annual filing, FY sample", "company", "financial_data", "finance"),
  log(5400, "financial_data", "Price history loaded: 252 trading days", false, "finance"),
  st(5500, "financial_data", "done", undefined, "finance"),
  st(5600, "calculator", "running", "Computing returns", "finance"),
  log(5700, "calculator", "Computing event-window returns with pandas", false, "finance"),
  src(6100, "Docket entry: motion ruling (sample)", "official_court", "legal_records", "legal"),
  src(6500, "Wire-service news report (sample)", "reputable_news", "web_research"),
  log(7000, "calculator", "Cumulative return and drawdown computed", false, "finance"),
  st(7100, "calculator", "done", undefined, "finance"),
  { at: 7200, scope: "finance", event: { type: "chart_ready", payload: { title: "Price around event window" } } },
  src(7600, "Court order summary (sample)", "official_court", "legal_records", "legal"),
  log(7800, "legal_records", "Records retrieval complete", false, "legal"),
  st(7900, "legal_records", "done", undefined, "legal"),
  src(8600, "Company statement (sample)", "company", "web_research"),
  log(9000, "web_research", "Compressing retrieved pages (embedding similarity, no chat call)"),
  st(9600, "web_research", "done"),

  // Verification: one LLM call extracts claims, deterministic rules set every status
  st(9900, "verification", "running", "Extracting claims"),
  log(10000, "verification", "Extracting claims and linking them to sources", true),
  log(10400, "verification", "Applying source-hierarchy rules to each claim"),
  claim(10600, "Court order issued on a stated date", "verified", "legal"),
  claim(11100, "Regulator opened an inquiry", "corroborated", "legal"),
  claim(11600, "Company denies the allegation", "verified", "legal"),
  claim(11800, "Reported revenue matches the annual filing", "verified", "finance"),
  claim(12100, "Price moved after the ruling", "corroborated", "both"),
  claim(12600, "Analyst estimate of impact", "unverified", "finance"),
  log(13000, "verification", "Verification summary written from rule results"),
  st(13600, "verification", "done"),

  // Report
  st(13900, "report_architect", "running", "Composing report"),
  log(14000, "report_architect", "Choosing report sections for this query", true),
  log(16000, "report_architect", "Attaching citations to claims"),
  st(17400, "report_architect", "done"),
  { at: 17700, event: { type: "report_ready", payload: { research_id: "demo-1" } } },
];

function inScope(scope: Scope, domains: DomainName[]): boolean {
  if (scope === undefined) return true;
  if (scope === "both") return domains.includes("legal") && domains.includes("finance");
  return domains.includes(scope);
}

/**
 * The sample run trimmed to the domains of this run, so a Legal-only or
 * Finance-only choice replays only the agents that would actually work.
 */
export function buildMockSequence(domains: DomainName[], manualOverride: boolean): TimedEvent[] {
  const rationale = manualOverride
    ? "Domain chosen manually on the research form (overrides automatic routing)."
    : "Query mentions both a regulatory dispute and stock impact.";
  const classified: ScopedEvent = { at: 1400, event: { type: "domain_classified", payload: { domains, rationale } } };
  return [...SAMPLE_RUN, classified]
    .filter((e) => inScope(e.scope, domains))
    .sort((a, b) => a.at - b.at)
    .map(({ at, event }) => ({ at, event }));
}
