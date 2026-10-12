import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileText, LayoutPanelLeft, Loader2, RefreshCw, Search, Star, Trash2 } from "lucide-react";

import AppShell from "@/components/layout/AppShell";
import { deleteRun, listHistory, setSaved, type HistoryEntry } from "@/lib/api";
import { formatDate, formatLocalDateTime } from "@/lib/format";
import { domainChip } from "@/lib/labels";
import { domainsForMode } from "@/lib/runConfig";
import { useRunStore } from "@/store/runStore";

type View = "all" | "saved";

const STATUS: Record<HistoryEntry["status"], { label: string; className: string }> = {
  completed: { label: "Completed", className: "text-tertiary" },
  running: { label: "In progress", className: "text-primary" },
  failed: { label: "Failed", className: "text-error" },
  stopped: { label: "Stopped by you", className: "text-warning" },
  interrupted: { label: "Stopped: server restarted", className: "text-error" },
};

function engine(entry: HistoryEntry): string {
  if (entry.scenario) return `Recorded demo · data as of ${formatDate(entry.scenario.data_as_of)}`;
  return entry.llm_provider === "gemini" ? "Live · Gemini" : "Live · rule-based stand-in";
}

export default function ResearchHistoryPage() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "saved" ? "saved" : "all";
  const [entries, setEntries] = useState<HistoryEntry[] | null | undefined>(undefined); // undefined = loading, null = backend down
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setEntries(undefined);
    setEntries(await listHistory(view === "saved", 200));
  }, [view]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const words = filter.toLowerCase().trim();
    if (!entries || !words) return entries;
    return entries.filter((e) => `${e.query} ${e.title ?? ""}`.toLowerCase().includes(words));
  }, [entries, filter]);

  function replace(updated: HistoryEntry) {
    setEntries((list) =>
      list?.flatMap((e) => (e.research_id !== updated.research_id ? [e] : view === "saved" && !updated.saved ? [] : [updated])),
    );
  }

  function remove(id: string) {
    setEntries((list) => list?.filter((e) => e.research_id !== id));
  }

  return (
    <AppShell breadcrumb={view === "saved" ? "CORE://HISTORY/SAVED" : "CORE://HISTORY"}>
      <div className="w-full max-w-[1100px] mx-auto px-4 sm:px-8 py-10 flex flex-col gap-6">
        <header className="flex flex-col gap-4 pb-4 border-b border-outline-variant/20">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                {view === "saved" ? "Saved reports" : "Research history"}
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant">
                {view === "saved"
                  ? "Reports you saved. Open one to read it again, with its sources and findings exactly as they were."
                  : "Every run the backend has done, newest first. Runs are saved on this computer, so they survive a restart."}
              </p>
            </div>
            <button
              type="button"
              onClick={load}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high transition-colors font-body-sm text-body-sm"
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 p-1 rounded-lg bg-surface-container-low border border-outline-variant/30" role="tablist">
              {(["all", "saved"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setParams(v === "saved" ? { view: "saved" } : {})}
                  className={`px-3 py-1.5 rounded-md font-body-sm text-body-sm transition-colors ${
                    view === v ? "bg-primary-container text-on-primary-container font-medium" : "text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  {v === "saved" ? "Saved reports" : "All runs"}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/40 focus-within:border-primary-container min-w-[240px]">
              <Search size={14} className="text-outline" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by question or title"
                className="bg-transparent border-0 outline-none text-on-surface placeholder:text-outline/70 font-body-sm text-body-sm w-full"
              />
            </label>
          </div>
        </header>

        {error && (
          <p role="alert" className="font-body-sm text-body-sm text-error">
            {error}
          </p>
        )}

        {entries === undefined && (
          <div className="flex items-center gap-2 text-on-surface-variant font-body-md text-body-md py-12 justify-center">
            <Loader2 size={18} className="animate-spin" /> Loading history
          </div>
        )}
        {entries === null && <BackendDown />}
        {shown && shown.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant py-12 text-center">
            {filter
              ? "No runs match this filter."
              : view === "saved"
                ? "No saved reports yet. Open a finished report and press Save report."
                : "No research yet. Start one from New Research, or run a demo scenario from the Dashboard."}
          </p>
        )}
        {shown && shown.length > 0 && (
          <ul className="flex flex-col gap-3">
            {shown.map((entry) => (
              <HistoryRow key={entry.research_id} entry={entry} onChange={replace} onDeleted={remove} onError={setError} />
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function HistoryRow({
  entry,
  onChange,
  onDeleted,
  onError,
}: {
  entry: HistoryEntry;
  onChange: (e: HistoryEntry) => void;
  onDeleted: (id: string) => void;
  onError: (message: string | null) => void;
}) {
  const navigate = useNavigate();
  const forgetRun = useRunStore((s) => s.forgetRun);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = entry.research_id;
  const domains = entry.domains.length ? entry.domains : domainsForMode(entry.mode);
  const chip = domainChip(domains.length === 2 ? null : domains[0]);
  const status = STATUS[entry.status];
  const finished = entry.status === "completed";

  async function toggleSaved() {
    setBusy(true);
    const updated = await setSaved(id, !entry.saved);
    setBusy(false);
    if (updated) {
      onError(null);
      onChange(updated);
    } else onError("Could not update Saved reports. Is the backend still running?");
  }

  async function confirmDelete() {
    setBusy(true);
    const ok = await deleteRun(id);
    setBusy(false);
    if (ok) {
      onError(null);
      forgetRun(id);
      onDeleted(id);
    } else {
      setConfirming(false);
      onError("Could not delete the run. A run that is still in progress can't be deleted.");
    }
  }

  return (
    <li className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 hover:border-outline-variant/60 transition-colors">
      <button
        type="button"
        onClick={() => navigate(finished ? `/research/${id}/report` : `/research/${id}`)}
        className="text-left flex flex-col gap-1.5 min-w-0 flex-1"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-tag-caps text-tag-caps px-1.5 py-0.5 rounded border uppercase tracking-wider ${chip.className}`}>{chip.label}</span>
          <span className={`font-label-code-sm text-label-code-sm ${status.className}`}>{status.label}</span>
          <span className="font-label-code-sm text-label-code-sm text-outline">· {engine(entry)}</span>
          <span className="font-label-code-sm text-label-code-sm text-outline">· {formatLocalDateTime(entry.created_at)}</span>
        </div>
        <span className="font-body-md text-body-md text-on-surface font-medium">{entry.title ?? entry.query}</span>
        {entry.title && <span className="font-body-sm text-body-sm text-on-surface-variant truncate">Question: {entry.query}</span>}
        {finished && (
          <span className="font-label-code-sm text-label-code-sm text-outline">
            {entry.source_count} source{entry.source_count === 1 ? "" : "s"} · {entry.claim_count} finding{entry.claim_count === 1 ? "" : "s"}
          </span>
        )}
      </button>

      <div className="flex items-center gap-2 shrink-0">
        {confirming ? (
          <>
            <span className="font-body-sm text-body-sm text-on-surface-variant">Delete this run for good?</span>
            <button
              type="button"
              disabled={busy}
              onClick={confirmDelete}
              className="px-3 py-1.5 rounded-lg bg-error text-on-error font-body-sm text-body-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-3 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high font-body-sm text-body-sm"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            {finished && (
              <button
                type="button"
                title="Open the report"
                onClick={() => navigate(`/research/${id}/report`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high font-body-sm text-body-sm"
              >
                <FileText size={14} /> Report
              </button>
            )}
            <button
              type="button"
              title="Open the workspace"
              onClick={() => navigate(`/research/${id}/workspace`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high font-body-sm text-body-sm"
            >
              <LayoutPanelLeft size={14} /> Workspace
            </button>
            {finished && (
              <button
                type="button"
                disabled={busy}
                aria-pressed={entry.saved}
                title={entry.saved ? "Remove from Saved reports" : "Add to Saved reports"}
                onClick={toggleSaved}
                className={`p-2 rounded-lg border transition-colors disabled:opacity-50 ${
                  entry.saved ? "border-primary/40 text-primary bg-primary/10" : "border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                <Star size={16} fill={entry.saved ? "currentColor" : "none"} />
              </button>
            )}
            {entry.status !== "running" && (
              <button
                type="button"
                title="Delete this run"
                onClick={() => setConfirming(true)}
                className="p-2 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:text-error hover:border-error/40 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/** The backend keeps the history; without it, show what this browser has. */
function BackendDown() {
  const navigate = useNavigate();
  const runs = useRunStore((s) => s.runs);
  const local = Object.values(runs)
    .filter((r) => !r.sample)
    .sort((a, b) => b.startedAt - a.startedAt);
  return (
    <div className="flex flex-col gap-4">
      <div className="p-4 rounded-xl bg-surface-container-low border border-dashed border-outline-variant/40 font-body-md text-body-md text-on-surface-variant">
        The backend isn't running, so the saved history can't be shown. Start it (see the README) and press Refresh.
        {local.length > 0 && " Meanwhile, these runs are in this browser:"}
      </div>
      {local.length > 0 && (
        <ul className="flex flex-col gap-2">
          {local.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => navigate(`/research/${r.id}`)}
                className="w-full text-left p-3 rounded-lg bg-surface-container-low border border-outline-variant/30 hover:border-primary-container font-body-md text-body-md text-on-surface"
              >
                {r.config.query}
                <span className="ml-2 font-label-code-sm text-label-code-sm text-outline">
                  {r.engine.kind === "backend" ? "Backend run" : "Sample replay"} · {formatLocalDateTime(r.startedAt, false)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
