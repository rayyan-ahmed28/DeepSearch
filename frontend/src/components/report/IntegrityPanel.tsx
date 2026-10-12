import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";

import type { ReportAudit } from "@/lib/report";

interface Row {
  label: string;
  value: number;
  /** true when a non-zero value is a problem */
  bad?: boolean;
}

/** What code checked before the report was released: the number audit and citation resolution. */
export default function IntegrityPanel({ audit }: { audit: ReportAudit }) {
  const rows: Row[] = [
    { label: "Figures filled from stored calculations", value: new Set(audit.figures_filled).size },
    { label: "Figures with no calculation (removed)", value: audit.figures_unresolved.length, bad: true },
    { label: "Numbers typed outside placeholders", value: audit.free_numbers.length, bad: true },
    { label: "Citations that resolve to a retrieved source", value: audit.citations_resolved },
    { label: "Citations removed (no such source)", value: audit.citations_removed.length, bad: true },
  ];
  return (
    <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-tag-caps text-tag-caps uppercase text-outline">
          <ShieldCheck size={14} className="text-primary" /> Report integrity
        </span>
        {audit.clean ? (
          <span className="flex items-center gap-1 font-label-code-sm text-[11px] text-tertiary">
            <CheckCircle2 size={12} /> All checks passed
          </span>
        ) : (
          <span className="flex items-center gap-1 font-label-code-sm text-[11px] text-warning">
            <AlertTriangle size={12} /> Needs review
          </span>
        )}
      </div>
      <dl className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-3 font-body-sm text-body-sm">
            <dt className="text-on-surface-variant">{r.label}</dt>
            <dd className={`font-label-code-sm text-label-code-sm tabular-nums ${r.bad && r.value > 0 ? "text-warning" : "text-on-surface"}`}>
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
      {audit.sections_dropped.length > 0 && (
        <p className="font-body-sm text-body-sm text-outline">
          Dropped as off-topic for this run: {audit.sections_dropped.map((k) => k.replace(/_/g, " ")).join(", ")}.
        </p>
      )}
      <p className="font-body-sm text-body-sm text-outline">Checked by code after the draft was written, not by the LLM.</p>
    </div>
  );
}
