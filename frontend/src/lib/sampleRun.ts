/**
 * The sample run replayed in Demo Mode until the backend exists.
 *
 * Everything here is fictional ("Example Corp", ticker EXMP) and labelled as
 * sample data in the UI. The price series is synthetic, generated below, and
 * the one market-reaction figure is computed from that same series, the way
 * real reports may only use numbers from stored calculations (D20).
 */
import type {
  AgentId,
  AgentStatus,
  ChartPayload,
  ClaimPayload,
  DomainName,
  ExecEvent,
  SourcePayload,
  TimedEvent,
  TimelineEntry,
} from "@/lib/executionEvents";
import { assembleReport, type DraftSection } from "@/lib/report";

export const SAMPLE_TICKER = "EXMP";
const RULING_DATE = "2026-04-10";

// ── Synthetic price series ─────────────────────────────────────────
function tradingDays(fromIso: string, toIso: string): string[] {
  const days: string[] = [];
  const d = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  while (d <= end) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

function syntheticCloses(): { date: string; close: number }[] {
  const days = tradingDays("2026-02-23", "2026-04-30");
  const rulingIdx = days.indexOf(RULING_DATE);
  let price = 48;
  return days.map((date, i) => {
    if (i < rulingIdx) price = 48 + 0.02 * i + 0.6 * Math.sin(i / 3);
    else if (i === rulingIdx) price *= 0.93;
    else if (i === rulingIdx + 1) price *= 0.97;
    else price *= 1.003;
    return { date, close: Math.round(price * 100) / 100 };
  });
}

const CLOSES = syntheticCloses();

function closeOn(offsetFromRuling: number): number {
  const idx = CLOSES.findIndex((p) => p.date === RULING_DATE) + offsetFromRuling;
  return CLOSES[idx].close;
}

/** Event-window return: close the day before the ruling to the close the day after (pandas pct_change equivalent). */
const EVENT_RETURN_PCT = Math.round((closeOn(1) / closeOn(-1) - 1) * 10000) / 100;

const CHART: ChartPayload = {
  id: "ch1",
  type: "line",
  title: `${SAMPLE_TICKER} daily close around the ruling (synthetic sample data)`,
  data: CLOSES,
};

// ── Sources, claims, timeline ──────────────────────────────────────
const S: Record<string, SourcePayload> = {
  s1: {
    id: "s1",
    title: "Docket entry: Example Corp v. State Regulator, complaint (sample)",
    source_type: "official_court",
    retrieved_by: "legal_records",
    published_date: "2026-03-02",
    snippet: "Complaint filed. The regulator alleges Example Corp misstated the results of its product safety testing.",
  },
  s2: {
    id: "s2",
    title: "Regulator press release announcing the complaint (sample)",
    source_type: "regulatory",
    retrieved_by: "web_research",
    published_date: "2026-03-02",
    snippet: "The regulator announced it has filed a complaint against Example Corp over its product safety disclosures.",
  },
  s3: {
    id: "s3",
    title: "Example Corp annual filing, fiscal year 2025 (sample)",
    source_type: "company",
    retrieved_by: "financial_data",
    published_date: "2026-02-16",
    snippet: "Total revenue for the fiscal year was 1.20 billion USD.",
  },
  s4: {
    id: "s4",
    title: "Docket entry: order on motion to dismiss (sample)",
    source_type: "official_court",
    retrieved_by: "legal_records",
    published_date: RULING_DATE,
    snippet: "The court denied Example Corp's motion to dismiss. The case proceeds to discovery.",
  },
  s5: {
    id: "s5",
    title: "Wire-service report on the ruling (sample)",
    source_type: "reputable_news",
    retrieved_by: "web_research",
    published_date: RULING_DATE,
    snippet: "Shares of Example Corp fell after a court denied the company's motion to dismiss the regulator's case.",
  },
  s6: {
    id: "s6",
    title: "Court order summary (sample)",
    source_type: "official_court",
    retrieved_by: "legal_records",
    published_date: RULING_DATE,
    snippet: "Order denying motion to dismiss; scheduling conference set for next month.",
  },
  s7: {
    id: "s7",
    title: "Example Corp statement on the ruling (sample)",
    source_type: "company",
    retrieved_by: "web_research",
    published_date: "2026-04-11",
    snippet: "Example Corp said it disagrees with the allegations and will defend itself in court.",
  },
};

const C: Record<string, ClaimPayload> = {
  c1: {
    id: "c1",
    text: "The court denied Example Corp's motion to dismiss on 10 April 2026; the case proceeds to discovery.",
    claim_type: "established_fact",
    verification: "verified",
    source_ids: ["s4", "s6"],
    domain: "legal",
    event_date: RULING_DATE,
  },
  c2: {
    id: "c2",
    text: "The regulator alleges Example Corp misstated the results of its product safety testing.",
    claim_type: "allegation",
    verification: "verified",
    source_ids: ["s1", "s2"],
    domain: "legal",
    event_date: "2026-03-02",
  },
  c3: {
    id: "c3",
    text: "Example Corp says it disagrees with the allegations and will defend itself in court.",
    claim_type: "company_statement",
    verification: "verified",
    source_ids: ["s7"],
    domain: "legal",
    event_date: "2026-04-11",
  },
  c4: {
    id: "c4",
    text: "Example Corp reported fiscal-year 2025 revenue of 1.20 billion USD.",
    claim_type: "company_statement",
    verification: "verified",
    source_ids: ["s3"],
    domain: "finance",
    value: 1.2e9,
    unit: "USD",
  },
  c5: {
    id: "c5",
    text: `${SAMPLE_TICKER} fell ${Math.abs(EVENT_RETURN_PCT).toFixed(1)}% from the close before the ruling to the close after it.`,
    claim_type: "established_fact",
    verification: "corroborated",
    source_ids: ["s5"],
    domain: null,
    event_date: RULING_DATE,
    value: EVENT_RETURN_PCT,
    unit: "%",
  },
  c6: {
    id: "c6",
    text: "An analyst estimate suggests the case could reduce next year's earnings.",
    claim_type: "analysis",
    verification: "unverified",
    source_ids: [],
    domain: "finance",
  },
};

const TIMELINE: TimelineEntry[] = [
  { date: "2026-03-02", label: "Complaint filed", description: "The regulator files its complaint against Example Corp.", source_ids: ["s1", "s2"] },
  { date: RULING_DATE, label: "Motion to dismiss denied", description: "The court denies Example Corp's motion; the case proceeds.", source_ids: ["s4", "s6"] },
  { date: "2026-04-11", label: "Company responds", description: "Example Corp says it will defend itself.", source_ids: ["s7"] },
];

// ── Timed replay ───────────────────────────────────────────────────

/**
 * Which runs an event belongs to: a single domain, "both" (only when Legal and
 * Finance run together), or untagged (every run).
 */
type Scope = DomainName | "both" | undefined;

interface ScopedEvent extends TimedEvent {
  scope?: Scope;
}

const ev = (at: number, event: ExecEvent, scope?: Scope): ScopedEvent => ({ at, event, scope });
const st = (at: number, agent: AgentId, status: AgentStatus, detail?: string, scope?: Scope) =>
  ev(at, { type: "agent_status", payload: { agent, status, detail } }, scope);
const log = (at: number, agent: AgentId, message: string, llm_call = false, scope?: Scope) =>
  ev(at, { type: "activity_log", payload: { agent, message, llm_call, level: "info" } }, scope);
const src = (at: number, id: string, scope?: Scope) => ev(at, { type: "source_found", payload: S[id] }, scope);
const claim = (at: number, id: string, scope?: Scope) => ev(at, { type: "claim_verified", payload: C[id] }, scope);

/**
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
  ev(3000, { type: "plan_created", payload: { manager: "legal", tasks: ["Find court and regulator records", "Collect reputable news coverage", "Build case timeline"] } }, "legal"),
  ev(3100, { type: "plan_created", payload: { manager: "finance", tasks: ["Pull price history", "Pull company filings", "Compute event-window returns"] } }, "finance"),
  st(3200, "legal_manager", "done", undefined, "legal"),
  st(3200, "finance_manager", "done", undefined, "finance"),

  // Workers (deterministic)
  st(3500, "legal_records", "running", "Querying court records", "legal"),
  st(3500, "web_research", "running", "Searching and compressing web sources"),
  st(3500, "financial_data", "running", "Fetching price history", "finance"),
  log(3600, "legal_records", "Searching court records API", false, "legal"),
  log(3700, "web_research", "Generating search sub-queries for the legal tasks", true, "legal"),
  log(3750, "web_research", "Generating search sub-queries for the financial tasks", true, "finance"),
  log(3800, "financial_data", `Fetching daily prices for ${SAMPLE_TICKER}`, false, "finance"),
  src(4300, "s1", "legal"),
  src(4800, "s2", "legal"),
  src(5200, "s3", "finance"),
  log(5400, "financial_data", `Price history loaded: ${CLOSES.length} trading days`, false, "finance"),
  st(5500, "financial_data", "done", undefined, "finance"),
  st(5600, "calculator", "running", "Computing returns", "finance"),
  log(5700, "calculator", "Computing event-window returns with pandas", false, "finance"),
  src(6100, "s4", "legal"),
  src(6500, "s5"),
  ev(6900, {
    type: "calculation_ready",
    payload: {
      id: "ret_event_window",
      description: `${SAMPLE_TICKER} return from the close before the ruling to the close after it`,
      result: EVENT_RETURN_PCT,
      method: "pandas: close[t+1] / close[t-1] - 1",
      unit: "%",
    },
  }, "finance"),
  log(7000, "calculator", "Event-window return computed from the price series", false, "finance"),
  st(7100, "calculator", "done", undefined, "finance"),
  ev(7200, { type: "chart_ready", payload: CHART }, "finance"),
  src(7600, "s6", "legal"),
  log(7800, "legal_records", "Records retrieval complete", false, "legal"),
  st(7900, "legal_records", "done", undefined, "legal"),
  src(8600, "s7"),
  log(9000, "web_research", "Compressing retrieved pages (embedding similarity, no chat call)"),
  st(9600, "web_research", "done"),

  // Verification: one LLM call extracts claims, deterministic rules set every status
  st(9900, "verification", "running", "Extracting claims"),
  log(10000, "verification", "Extracting claims and linking them to sources", true),
  log(10400, "verification", "Applying source-hierarchy rules to each claim"),
  claim(10600, "c1", "legal"),
  claim(11100, "c2", "legal"),
  claim(11600, "c3", "legal"),
  claim(11800, "c4", "finance"),
  claim(12100, "c5", "both"),
  claim(12600, "c6", "finance"),
  ev(12800, { type: "timeline_ready", payload: { events: TIMELINE } }, "legal"),
  log(13000, "verification", "Verification summary written from rule results"),
  st(13600, "verification", "done"),

  // Report
  st(13900, "report_architect", "running", "Composing report"),
  log(14000, "report_architect", "Choosing report sections for this query", true),
  log(16000, "report_architect", "Attaching citations to claims"),
  st(17400, "report_architect", "done"),
  // report_ready is appended at 17700 by buildMockSequence
];

function inScope(scope: Scope, domains: DomainName[]): boolean {
  if (scope === undefined) return true;
  if (scope === "both") return domains.includes("legal") && domains.includes("finance");
  return domains.includes(scope);
}

/**
 * The Report Architect's narrative for the sample, written the way the real
 * one must be: figures only as {{calc:<id>}} placeholders, every paragraph
 * citing the sources it relies on. Sections that don't fit the run's domains
 * are dropped by `assembleReport`, exactly as the backend does.
 */
function sampleDrafts(domains: DomainName[]): DraftSection[] {
  const legal = domains.includes("legal");
  const finance = domains.includes("finance");
  const summary: DraftSection["paragraphs"] = [];
  if (legal) {
    summary.push({
      text: "On 10 April 2026 a court denied Example Corp's motion to dismiss the regulator's case, so the case proceeds to discovery. The regulator alleges the company misstated its product safety testing; the company disputes this.",
      source_ids: ["s4", "s6", "s1", "s7"],
    });
  }
  if (finance) {
    summary.push({
      text: `${SAMPLE_TICKER} returned {{calc:ret_event_window}} from the close before the ruling to the close after it.`,
      source_ids: ["s5"],
    });
  }
  return [
    { kind: "executive_summary", heading: "Executive summary", paragraphs: summary },
    {
      kind: "case_overview",
      heading: "Case overview",
      paragraphs: [{
        text: "The regulator filed a complaint against Example Corp on 2 March 2026, alleging that the company misstated the results of its product safety testing. These are allegations: no court has ruled on whether they are true.",
        source_ids: ["s1", "s2"],
      }],
    },
    {
      kind: "legal_developments",
      heading: "Legal developments",
      paragraphs: [
        { text: "The court denied the company's motion to dismiss and the case moves to discovery.", source_ids: ["s4", "s6"] },
        { text: "Example Corp said it disagrees with the allegations and will defend itself in court.", source_ids: ["s7"] },
      ],
    },
    {
      kind: "market_reaction",
      heading: "Market reaction",
      paragraphs: [{
        text: `${SAMPLE_TICKER} returned {{calc:ret_event_window}} across the ruling, measured close to close. The fall coincided with the ruling and was reported in the press; this report does not claim the ruling alone caused it.`,
        source_ids: ["s5"],
      }],
    },
    {
      kind: "risk_factors",
      heading: "Risk factors",
      paragraphs: [{
        text: "Further rulings in the case could move the share price again. This is a possibility, not a forecast. One analyst estimate suggests earnings could be reduced, but it has no supporting source and is shown as unverified.",
        source_ids: legal ? ["s4"] : [],
      }],
    },
  ];
}

const SAMPLE_TITLES: Record<string, string> = {
  "legal,finance": "Example Corp: the regulator's case and the market reaction (sample report)",
  legal: "Example Corp: status of the regulator's case (sample report)",
  finance: "Example Corp: market reaction to the court ruling (sample report)",
};

/**
 * The sample run trimmed to the domains of this run, so a Legal-only or
 * Finance-only choice replays only the agents that would actually work. The
 * final event carries a report assembled from exactly the events replayed.
 */
export function buildMockSequence(domains: DomainName[], manualOverride: boolean, researchId: string, query: string): TimedEvent[] {
  const rationale = manualOverride
    ? "Domain chosen manually on the research form (overrides automatic routing)."
    : "Query mentions both a regulatory dispute and stock impact.";
  const steps = [...SAMPLE_RUN, ev(1400, { type: "domain_classified", payload: { domains, rationale } })]
    .filter((e) => inScope(e.scope, domains))
    .sort((a, b) => a.at - b.at)
    .map(({ at, event }) => ({ at, event }));

  const events = steps.map((s) => s.event);
  const report = assembleReport({
    researchId,
    title: SAMPLE_TITLES[[...domains].sort().join(",")] ?? SAMPLE_TITLES["legal,finance"],
    query,
    domains,
    llmProvider: "sample",
    drafts: sampleDrafts(domains),
    gaps: ["This is a sample report about a fictional company. Prices are synthetic and generated in code, and the sources are illustrative, with no links."],
    sources: events.flatMap((e) => (e.type === "source_found" ? [e.payload] : [])),
    claims: events.flatMap((e) => (e.type === "claim_verified" ? [e.payload] : [])),
    calculations: events.flatMap((e) => (e.type === "calculation_ready" ? [e.payload] : [])),
    charts: events.flatMap((e) => (e.type === "chart_ready" ? [e.payload] : [])),
    timeline: events.flatMap((e) => (e.type === "timeline_ready" ? e.payload.events : [])),
  });
  return [...steps, { at: 17700, event: { type: "report_ready", payload: { research_id: researchId, report } } }];
}
