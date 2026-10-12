/**
 * Event contract shared by the Execution and Workspace screens.
 *
 * Shapes mirror backend `WSEvent` (app/models/schemas.py): `type` + `payload`,
 * and the payloads mirror the backend models (`Source`, `Claim`, `ChartSpec`,
 * `TimelineEvent`). The sample replay (lib/sampleRun.ts) and the future
 * WebSocket both emit `ExecEvent`, so swapping mock -> live only changes the
 * event source (store/runStore.ts), not any component.
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

/** Mirrors backend `SourceType`. */
export type SourceType = "official_court" | "regulatory" | "company" | "reputable_news" | "secondary";

/** Mirrors backend `VerificationStatus`. Set by rules, never by an LLM. */
export type ClaimStatus = "verified" | "corroborated" | "unverified" | "conflicting";

/** Mirrors backend `ClaimType`. */
export type ClaimType =
  | "established_fact"
  | "allegation"
  | "party_claim"
  | "company_statement"
  | "regulatory_statement"
  | "news_report"
  | "analysis";

/** Mirrors backend `Source`. `url` may be absent for sample data, which has no real link. */
export interface SourcePayload {
  id: string;
  title: string;
  url?: string | null;
  source_type: SourceType;
  published_date?: string | null; // ISO date; often unknown for web pages
  retrieved_by: AgentId;
  snippet?: string | null;
}

/** Mirrors backend `Claim`. `domain: null` means cross-domain. */
export interface ClaimPayload {
  id: string;
  text: string;
  claim_type: ClaimType;
  verification: ClaimStatus;
  source_ids: string[];
  domain: DomainName | null;
  event_date?: string | null;
  value?: number | null;
  unit?: string | null;
}

/** Mirrors backend `ChartSpec`: Recharts-ready records. */
export interface ChartPayload {
  id: string;
  type: "line" | "bar" | "timeline";
  title: string;
  data: Record<string, string | number>[];
}

/** Mirrors backend `Calculation`: a figure computed in code, with its method (D20). */
export interface CalculationPayload {
  id: string;
  description: string;
  result: number | Record<string, unknown>;
  method: string;
  unit?: string | null;
}

/** Mirrors backend `TimelineEvent`. */
export interface TimelineEntry {
  date: string; // ISO date
  label: string;
  description: string;
  source_ids: string[];
}

export type ExecEvent =
  | { type: "domain_classified"; payload: { domains: DomainName[]; rationale: string } }
  | { type: "plan_created"; payload: { manager: DomainName; tasks: string[] } }
  | { type: "agent_status"; payload: { agent: AgentId; status: AgentStatus; detail?: string } }
  | { type: "activity_log"; payload: { agent: AgentId; message: string; level?: LogLevel; llm_call?: boolean } }
  | { type: "source_found"; payload: SourcePayload }
  | { type: "claim_verified"; payload: ClaimPayload }
  | { type: "chart_ready"; payload: ChartPayload }
  | { type: "calculation_ready"; payload: CalculationPayload }
  | { type: "timeline_ready"; payload: { events: TimelineEntry[] } }
  // The full report travels with the final event (see lib/report.ts for its shape).
  | { type: "report_ready"; payload: { research_id: string; report?: import("@/lib/report").Report | null } }
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

export const KIND_LABEL: Record<AgentMeta["kind"], string> = {
  llm: "LLM",
  hybrid: "RULES + LLM",
  tool: "DETERMINISTIC",
};

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
