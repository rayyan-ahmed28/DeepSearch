/**
 * Report contract: TypeScript mirror of backend `Report` (app/models/schemas.py).
 * Also: the placeholder filler and section assembly used for sample reports
 * (same rules as backend app/utils/report_builder.py), and Markdown export.
 */
import type {
  CalculationPayload,
  ChartPayload,
  ClaimPayload,
  DomainName,
  SourcePayload,
  TimelineEntry,
} from "@/lib/executionEvents";
import { formatCalculation, formatDate } from "@/lib/format";
import { CLAIM_TYPE_LABEL, SOURCE_TYPE_LABEL, VERIFICATION_LABEL } from "@/lib/labels";

export type SectionKind =
  | "executive_summary"
  | "key_findings"
  | "case_overview"
  | "legal_developments"
  | "financial_impact"
  | "market_reaction"
  | "data_analysis"
  | "timeline"
  | "risk_factors"
  | "limitations"
  | "sources"
  | "disclaimer";

/** Display order (same as the backend enum). */
export const SECTION_ORDER: SectionKind[] = [
  "executive_summary",
  "key_findings",
  "case_overview",
  "legal_developments",
  "financial_impact",
  "market_reaction",
  "data_analysis",
  "timeline",
  "risk_factors",
  "limitations",
  "sources",
  "disclaimer",
];

export interface CitedText {
  text: string;
  citations: string[];
}

export type ReportBlock =
  | ({ type: "paragraph" } & CitedText)
  | { type: "bullets"; items: CitedText[] }
  | { type: "finding"; claim_id: string }
  | { type: "chart"; chart_id: string }
  | { type: "calculations"; calculation_ids: string[] }
  | { type: "timeline" }
  | { type: "sources" }
  | { type: "callout"; tone: "info" | "warning"; text: string };

export interface ReportSection {
  id: string;
  kind: SectionKind;
  heading: string;
  blocks: ReportBlock[];
}

export interface ReportAudit {
  figures_filled: string[];
  figures_unresolved: string[];
  free_numbers: string[];
  citations_resolved: number;
  citations_removed: string[];
  sections_dropped: string[];
  clean: boolean;
}

export interface Report {
  research_id: string;
  title: string;
  query: string;
  generated_at: string;
  domains: DomainName[];
  demo_mode: boolean;
  llm_provider: string;
  sections: ReportSection[];
  sources: SourcePayload[];
  claims: ClaimPayload[];
  calculations: CalculationPayload[];
  charts: ChartPayload[];
  timeline: TimelineEntry[];
  audit: ReportAudit;
}

export const DISCLAIMER =
  "This report is research information, not legal or investment advice. Allegations are reported as " +
  "allegations, market effects as possibilities, and past price movements do not predict future returns.";

// ── Placeholders and audit (mirrors backend app/utils/placeholders.py) ──
const PLACEHOLDER = /\{\{calc:([A-Za-z0-9_-]+)\}\}/g;
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const ALLOWED_NUMBERS = new RegExp(
  `\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2} (?:${MONTHS}) (?:19|20)\\d{2}\\b|\\b(?:19|20)\\d{2}\\b`,
  "g",
);
const ANY_NUMBER = /\d+(?:[.,]\d+)*/g;

interface FigureAudit {
  resolved: string[];
  unresolved: string[];
  freeNumbers: string[];
}

function fillPlaceholders(text: string, calcs: Record<string, CalculationPayload>, audit: FigureAudit): string {
  const free = text.replace(PLACEHOLDER, "").replace(ALLOWED_NUMBERS, "").match(ANY_NUMBER);
  if (free) audit.freeNumbers.push(...free);
  return text.replace(PLACEHOLDER, (_, id: string) => {
    const calc = calcs[id];
    if (!calc) {
      audit.unresolved.push(id);
      return "[figure unavailable]";
    }
    audit.resolved.push(id);
    return formatCalculation(calc.result, calc.unit);
  });
}

// ── Assembly (mirrors backend build_report) ─────────────────────────
export interface DraftSection {
  kind: SectionKind;
  heading: string;
  paragraphs: { text: string; source_ids: string[] }[];
}

const DOMAIN_SECTIONS: Record<DomainName, SectionKind[]> = {
  legal: ["case_overview", "legal_developments"],
  finance: ["financial_impact", "market_reaction"],
};

export function assembleReport(input: {
  researchId: string;
  title: string;
  query: string;
  domains: DomainName[];
  llmProvider: string;
  drafts: DraftSection[];
  gaps: string[];
  sources: SourcePayload[];
  claims: ClaimPayload[];
  calculations: CalculationPayload[];
  charts: ChartPayload[];
  timeline: TimelineEntry[];
}): Report {
  const calcs = Object.fromEntries(input.calculations.map((c) => [c.id, c]));
  const known = new Set(input.sources.map((s) => s.id));
  const figures: FigureAudit = { resolved: [], unresolved: [], freeNumbers: [] };
  const removed: string[] = [];
  let resolved = 0;
  const keep = (ids: string[]) => {
    const kept: string[] = [];
    for (const id of ids) {
      if (!known.has(id)) removed.push(id);
      else if (!kept.includes(id)) {
        kept.push(id);
        resolved += 1;
      }
    }
    return kept;
  };

  const allowed = new Set<SectionKind>(["executive_summary", "risk_factors", ...input.domains.flatMap((d) => DOMAIN_SECTIONS[d])]);
  const sections = new Map<SectionKind, ReportSection>();
  const dropped: string[] = [];
  for (const draft of input.drafts) {
    if (!allowed.has(draft.kind)) {
      dropped.push(draft.kind);
      continue;
    }
    const blocks: ReportBlock[] = draft.paragraphs.map((p) => ({
      type: "paragraph",
      text: fillPlaceholders(p.text, calcs, figures),
      citations: keep(p.source_ids),
    }));
    sections.set(draft.kind, { id: draft.kind, kind: draft.kind, heading: draft.heading, blocks });
  }

  const add = (kind: SectionKind, heading: string, blocks: ReportBlock[]) => sections.set(kind, { id: kind, kind, heading, blocks });
  if (input.claims.length) add("key_findings", "Key findings", input.claims.map((c) => ({ type: "finding", claim_id: c.id })));
  if (input.charts.length || input.calculations.length) {
    const blocks: ReportBlock[] = input.charts.map((c) => ({ type: "chart", chart_id: c.id }));
    if (input.calculations.length) blocks.push({ type: "calculations", calculation_ids: input.calculations.map((c) => c.id) });
    add("data_analysis", "Data analysis", blocks);
  }
  if (input.timeline.length) add("timeline", "Timeline", [{ type: "timeline" }]);
  if (input.gaps.length) add("limitations", "What this run did not cover", [{ type: "bullets", items: input.gaps.map((text) => ({ text, citations: [] })) }]);
  if (input.sources.length) add("sources", "Sources and evidence", [{ type: "sources" }]);
  add("disclaimer", "Important", [{ type: "callout", tone: "info", text: DISCLAIMER }]);

  const audit: ReportAudit = {
    figures_filled: figures.resolved,
    figures_unresolved: figures.unresolved,
    free_numbers: figures.freeNumbers,
    citations_resolved: resolved,
    citations_removed: removed,
    sections_dropped: dropped,
    clean: !figures.unresolved.length && !figures.freeNumbers.length && !removed.length,
  };
  return {
    research_id: input.researchId,
    title: input.title,
    query: input.query,
    generated_at: new Date().toISOString(),
    domains: input.domains,
    demo_mode: true,
    llm_provider: input.llmProvider,
    sections: SECTION_ORDER.filter((k) => sections.has(k)).map((k) => sections.get(k)!),
    sources: input.sources,
    claims: input.claims,
    calculations: input.calculations,
    charts: input.charts,
    timeline: input.timeline,
    audit,
  };
}

// ── Helpers for the screen and export ──────────────────────────────
/** Citation numbers follow the order of report.sources: [1], [2], ... */
export function citationNumbers(report: Report): Record<string, number> {
  return Object.fromEntries(report.sources.map((s, i) => [s.id, i + 1]));
}

function refs(ids: string[], numbers: Record<string, number>): string {
  return ids.map((id) => `[${numbers[id] ?? "?"}]`).join("");
}

export function reportToMarkdown(report: Report, engineLine: string): string {
  const n = citationNumbers(report);
  const claims = Object.fromEntries(report.claims.map((c) => [c.id, c]));
  const calcs = Object.fromEntries(report.calculations.map((c) => [c.id, c]));
  const charts = Object.fromEntries(report.charts.map((c) => [c.id, c]));
  const out: string[] = [
    `# ${report.title}`,
    "",
    `> ${report.query}`,
    "",
    `Generated ${new Date(report.generated_at).toUTCString()} · ${engineLine} · Domains: ${report.domains.join(", ")}`,
    "",
  ];
  report.sections.forEach((section, i) => {
    out.push(`## ${String(i + 1).padStart(2, "0")}. ${section.heading}`, "");
    for (const block of section.blocks) {
      switch (block.type) {
        case "paragraph":
          out.push(`${block.text} ${refs(block.citations, n)}`.trim(), "");
          break;
        case "bullets":
          block.items.forEach((item) => out.push(`- ${item.text} ${refs(item.citations, n)}`.trim()));
          out.push("");
          break;
        case "finding": {
          const c = claims[block.claim_id];
          if (c) out.push(`- **${CLAIM_TYPE_LABEL[c.claim_type]}** (${VERIFICATION_LABEL[c.verification]}): ${c.text} ${refs(c.source_ids, n)}`.trim());
          break;
        }
        case "chart":
          if (charts[block.chart_id]) out.push(`_Chart: ${charts[block.chart_id].title} (see the app)_`, "");
          break;
        case "calculations":
          out.push("| Figure | Value | Method |", "| --- | --- | --- |");
          block.calculation_ids.forEach((id) => {
            const c = calcs[id];
            if (c) out.push(`| ${c.description} | ${formatCalculation(c.result, c.unit)} | ${c.method} |`);
          });
          out.push("");
          break;
        case "timeline":
          report.timeline.forEach((e) => out.push(`- **${formatDate(e.date)}**: ${e.label}. ${e.description} ${refs(e.source_ids, n)}`.trim()));
          out.push("");
          break;
        case "sources":
          report.sources.forEach((s) =>
            out.push(
              `${n[s.id]}. ${s.title} (${SOURCE_TYPE_LABEL[s.source_type]}, ${s.published_date ? formatDate(s.published_date) : "date unknown"})${s.url ? ` ${s.url}` : " [no link: sample data]"}`,
            ),
          );
          out.push("");
          break;
        case "callout":
          out.push(`> ${block.text}`, "");
          break;
      }
    }
    if (section.kind === "key_findings") out.push("");
  });
  const a = report.audit;
  out.push(
    "---",
    `Report integrity: ${a.figures_filled.length} figure(s) filled from stored calculations, ${a.figures_unresolved.length} unresolved, ` +
      `${a.free_numbers.length} number(s) outside placeholders, ${a.citations_resolved} citation(s) resolve, ${a.citations_removed.length} removed.`,
  );
  return out.join("\n");
}
