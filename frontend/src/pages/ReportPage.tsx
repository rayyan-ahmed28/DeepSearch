import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Calculator, CalendarClock, Download, Gavel, LayoutPanelLeft, Library, LineChart, Loader2, Network, Printer, Star } from "lucide-react";

import ErrorBoundary from "@/components/common/ErrorBoundary";
import AppShell from "@/components/layout/AppShell";
import RunErrorBanner from "@/components/common/RunErrorBanner";
import RunLoading from "@/components/common/RunLoading";
import RunNotFound from "@/components/common/RunNotFound";
import IntegrityPanel from "@/components/report/IntegrityPanel";
import ReportBody from "@/components/report/ReportBody";
import { useRun } from "@/hooks/useRun";
import { getHistoryEntry, setSaved } from "@/lib/api";
import { reportToMarkdown, type Report } from "@/lib/report";
import { chartCaption as captionFor, engineLabel, useRunStore, type RunRecord } from "@/store/runStore";

export default function ReportPage() {
  const { id = "demo-1" } = useParams();
  const { run, missing } = useRun(id);
  const breadcrumb = `CORE://RESEARCH/${id.toUpperCase()}/REPORT`;
  return (
    <AppShell breadcrumb={breadcrumb}>
      {missing ? <RunNotFound id={id} /> : run ? <ReportView id={id} /> : <RunLoading id={id} />}
    </AppShell>
  );
}

function ReportView({ id }: { id: string }) {
  const navigate = useNavigate();
  const run = useRunStore((s) => s.runs[id])!;
  const report = run.state.report;

  if (!report) {
    return (
      <div className="w-full max-w-xl mx-auto px-4 sm:px-8 py-24 flex flex-col items-center text-center gap-4">
        {run.state.error ? (
          <>
            <RunErrorBanner message={run.state.error} />
            <p className="font-body-md text-body-md text-on-surface-variant">This run stopped before a report was written.</p>
          </>
        ) : (
          <>
            <Loader2 size={28} className="text-primary animate-spin" />
            <h1 className="font-headline-md text-headline-md text-on-surface">The report is still being written</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">It appears here as soon as the Report Architect finishes.</p>
          </>
        )}
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => navigate(`/research/${id}`)}
            className="px-4 py-2 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high transition-colors font-body-md text-body-md"
          >
            Execution view
          </button>
          <button
            onClick={() => navigate(`/research/${id}/workspace`)}
            className="px-4 py-2 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high transition-colors font-body-md text-body-md"
          >
            Workspace
          </button>
        </div>
      </div>
    );
  }
  return <ReportDocument run={run} report={report} />;
}

/** The section currently at the top of the viewport, for the table of contents. */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join(",");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace("section-", ""));
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    key.split(",").forEach((id) => {
      const el = document.getElementById(`section-${id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [key]);
  return active;
}

/** Adds the report to Saved Reports (backend runs only; hidden when the backend can't be reached). */
function SaveReportButton({ id, className }: { id: string; className: string }) {
  const [saved, setSavedState] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getHistoryEntry(id).then((entry) => {
      if (!cancelled && entry && entry !== "missing") setSavedState(entry.saved);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (saved === null) return null;
  async function toggle() {
    setBusy(true);
    const updated = await setSaved(id, !saved);
    setBusy(false);
    setFailed(!updated);
    if (updated) setSavedState(updated.saved);
  }
  return (
    <button type="button" className={className} disabled={busy} aria-pressed={saved} onClick={toggle}>
      <Star size={16} className={saved ? "text-primary" : "text-outline"} fill={saved ? "currentColor" : "none"} />
      {failed ? "Could not save: is the backend running?" : saved ? "Saved" : "Save report"}
    </button>
  );
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ReportDocument({ run, report }: { run: RunRecord; report: Report }) {
  const navigate = useNavigate();
  const active = useActiveSection(report.sections.map((s) => s.id));
  const label = engineLabel(run);
  const generated = new Date(report.generated_at);
  const chartCaption = captionFor(run);
  const button =
    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant/40 hover:border-outline text-on-surface font-body-sm text-body-sm transition-colors";

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <header className="flex flex-col gap-4 pb-6 border-b border-outline-variant/20">
        <div className="flex flex-wrap items-center gap-2 font-label-code-sm text-label-code-sm">
          <span className="text-primary uppercase tracking-wider">DeepSearch research report</span>
          <span className="text-outline-variant">/</span>
          <span className="text-outline">ID: {run.id}</span>
          <span className="px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary font-tag-caps text-tag-caps uppercase">
            {label.badge}
          </span>
          {run.sample && (
            <span className="px-2 py-0.5 rounded border border-outline-variant/40 text-outline font-tag-caps text-tag-caps uppercase">
              Fictional sample
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button type="button" className={button} onClick={() => navigate(`/research/${run.id}/workspace`)}>
            <LayoutPanelLeft size={16} className="text-outline" /> Workspace
          </button>
          <button type="button" className={button} onClick={() => navigate(`/research/${run.id}`)}>
            <Network size={16} className="text-outline" /> Execution view
          </button>
          <button
            type="button"
            className={button}
            onClick={() => downloadText(`deepsearch-report-${run.id}.md`, reportToMarkdown(report, label.line))}
          >
            <Download size={16} className="text-outline" /> Markdown
          </button>
          <button type="button" className={button} onClick={() => window.print()}>
            <Printer size={16} className="text-outline" /> Print / Save as PDF
          </button>
          {run.engine.kind === "backend" && <SaveReportButton id={run.id} className={button} />}
        </div>
        <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight max-w-5xl">{report.title}</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          <span className="text-outline">Question:</span> {report.query}
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-label-code-sm text-label-code-sm text-outline">
          <span className="flex items-center gap-1.5">
            <CalendarClock size={14} />
            {generated.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC
          </span>
          {report.domains.includes("legal") && (
            <span className="flex items-center gap-1.5 text-secondary bg-secondary/10 rounded px-2 py-0.5">
              <Gavel size={12} /> Legal
            </span>
          )}
          {report.domains.includes("finance") && (
            <span className="flex items-center gap-1.5 text-tertiary bg-tertiary/10 rounded px-2 py-0.5">
              <LineChart size={12} /> Finance
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Library size={14} /> {report.sources.length} source{report.sources.length === 1 ? "" : "s"}
          </span>
          <span className="flex items-center gap-1.5">
            <Calculator size={14} /> {new Set(report.audit.figures_filled).size} figure(s) from stored calculations
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-8">
        <aside className="lg:col-span-3 print:hidden">
          <div className="lg:sticky lg:top-24 flex flex-col gap-4">
            <nav className="flex flex-col gap-0.5" aria-label="Report sections">
              <span className="font-tag-caps text-tag-caps uppercase text-outline mb-2">Contents</span>
              {report.sections.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: "smooth" })}
                  className={`text-left px-3 py-1.5 rounded-lg font-body-sm text-body-sm transition-colors ${
                    active === s.id ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:bg-surface-container"
                  }`}
                >
                  <span className="font-label-code-sm text-label-code-sm text-outline mr-2">{String(i + 1).padStart(2, "0")}.</span>
                  {s.heading}
                </button>
              ))}
            </nav>
            <IntegrityPanel audit={report.audit} />
          </div>
        </aside>
        <div className="lg:col-span-9 min-w-0">
          <ErrorBoundary inline label="the report body">
            <ReportBody report={report} chartCaption={chartCaption} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
