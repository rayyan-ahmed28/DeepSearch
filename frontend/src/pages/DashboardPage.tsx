import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Brain, ArrowRight, Paperclip, ChevronDown, ShieldCheck, ExternalLink } from "lucide-react";

import AppShell from "@/components/layout/AppShell";
import DemoScenarios from "@/components/dashboard/DemoScenarios";
import { useNow } from "@/hooks/useRun";
import { listHistory, type HistoryEntry } from "@/lib/api";
import { formatAgo } from "@/lib/format";
import { domainChip } from "@/lib/labels";
import { SAMPLE_RUNS, domainsForMode, type ResearchDepth, type ResearchMode, type RunConfig } from "@/lib/runConfig";
import { useRunStore, type RunRecord } from "@/store/runStore";

const SCOPE_OPTIONS: { id: ResearchMode; label: string; dotClass: string }[] = [
  { id: "auto", label: "All Domains", dotClass: "bg-surface-container-lowest" },
  { id: "legal", label: "Legal Dockets", dotClass: "bg-secondary" },
  { id: "finance", label: "SEC & Earnings", dotClass: "bg-tertiary" },
];

const SUGGESTED_QUERIES: { domain: string; domainClass: string; mode: ResearchMode; title: string; meta: string }[] = [
  {
    domain: "Legal + Finance",
    domainClass: "text-primary",
    mode: "legal_finance",
    title: "Antitrust suit against a mid-cap retailer and its Q3 earnings exposure",
    meta: "Illustrative example",
  },
  {
    domain: "Finance",
    domainClass: "text-tertiary",
    mode: "finance",
    title: "Auditor resignation timeline for a semiconductor supplier and material disclosure deltas",
    meta: "Illustrative example",
  },
  {
    domain: "Legal",
    domainClass: "text-secondary",
    mode: "legal",
    title: "Patent infringement split ruling and its effect on licensing precedent",
    meta: "Illustrative example",
  },
  {
    domain: "Finance",
    domainClass: "text-tertiary",
    mode: "finance",
    title: "Data-breach litigation risk exposure and cyber insurance claims for a cloud vendor",
    meta: "Illustrative example",
  },
];

interface RecentItem {
  id: string;
  title: string;
  caseRef: string;
  domainLabel: string;
  domainClass: string;
  completed: boolean;
  /** Failed, or cut off by a backend restart. */
  stopped?: boolean;
  sources: number | null;
}

function historyItem(entry: HistoryEntry, now: number): RecentItem {
  const domains = entry.domains.length ? entry.domains : domainsForMode(entry.mode);
  const chip = domainChip(domains.length === 2 ? null : domains[0]);
  const kind = entry.scenario ? "Recorded demo" : "Backend run";
  return {
    id: entry.research_id,
    title: entry.query,
    caseRef: `${kind} · ${formatAgo(Date.parse(entry.created_at), now)}`,
    domainLabel: chip.label,
    domainClass: chip.className,
    completed: entry.status === "completed",
    stopped: entry.status === "failed" || entry.status === "interrupted",
    sources: entry.source_count,
  };
}

function toRecentItem(id: string, config: RunConfig, run: RunRecord | undefined, caseRef: string, completedByDefault: boolean): RecentItem {
  const domains = run && run.state.domains.length > 0 ? run.state.domains : domainsForMode(config.mode);
  const chip = domainChip(domains.length === 2 ? null : domains[0]);
  return {
    id,
    title: config.query,
    caseRef,
    domainLabel: chip.label,
    domainClass: chip.className,
    completed: run ? run.state.done : completedByDefault,
    sources: run ? run.state.sources.length : null,
  };
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ResearchMode>("auto");
  const [depth, setDepth] = useState<ResearchDepth>("standard");
  const startRun = useRunStore((s) => s.startRun);
  const runs = useRunStore((s) => s.runs);
  const now = useNow(true, 30_000);
  const [starting, setStarting] = useState(false);
  // The backend's saved history, or null when it isn't running (then this browser's runs are shown).
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  useEffect(() => {
    listHistory(false, 5).then(setHistory);
  }, []);

  // Takes query and mode explicitly: a suggestion click calls this in the
  // same tick as setQuery, before state has updated.
  async function startResearch(text: string = query, mode: ResearchMode = scope) {
    if (starting) return;
    setStarting(true);
    const id = await startRun({ query: text, mode, depth });
    navigate(`/research/${id}`);
  }

  // The saved history (or, with the backend off, this browser's runs), then the fictional samples.
  const recent: RecentItem[] = [
    ...(history
      ? history.map((h) => historyItem(h, now))
      : Object.values(runs)
          .filter((r) => !r.sample)
          .sort((a, b) => b.startedAt - a.startedAt)
          .slice(0, 5)
          .map((r) =>
            toRecentItem(r.id, r.config, r, `${r.engine.kind === "backend" ? "Backend run" : "Sample replay"} · ${formatAgo(r.startedAt, now)}`, false),
          )),
    ...Object.entries(SAMPLE_RUNS).map(([sid, def]) => toRecentItem(sid, def.config, runs[sid], "Fictional sample", def.completed)),
  ];

  return (
    <AppShell>
      <div className="w-full max-w-[1400px] mx-auto px-8 py-10 flex flex-col gap-10">
        {/* Greeting */}
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-outline-variant/20">
          <div className="flex flex-col gap-1.5 max-w-3xl">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container border border-outline-variant/40 font-label-code-sm text-label-code-sm text-tertiary">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                DEMO MODE
              </span>
              <span className="font-label-code-sm text-label-code-sm text-outline">·</span>
              <span className="font-label-code-sm text-label-code-sm text-secondary flex items-center gap-1">
                <ShieldCheck size={14} />
                CITATION VERIFICATION ACTIVE
              </span>
            </div>
            <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">
              Good afternoon<span className="text-primary-container">.</span>
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              Ask a legal or financial research question, and DeepSearch will plan, delegate, verify, and report
              back with citations.
            </p>
          </div>
        </header>

        {/* Research input */}
        <section className="flex flex-col">
          <div className="w-full rounded-xl bg-surface-container-low border border-outline-variant/40 focus-within:border-primary-container focus-within:ring-1 focus-within:ring-primary-container transition-all shadow-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
              <div className="flex items-center gap-2 font-label-code-sm text-label-code-sm text-outline">
                <Brain size={16} className="text-primary" />
                <span>RESEARCH PROMPT</span>
              </div>
            </div>

            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a legal or financial research question... (e.g. 'How could a recent lawsuit against a company affect its stock price?')"
              rows={3}
              className="w-full bg-transparent border-0 outline-none text-on-surface placeholder:text-outline/70 font-body-lg text-body-lg resize-none leading-relaxed"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-outline-variant/20">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-tag-caps text-tag-caps text-outline uppercase tracking-wider mr-1">Scope:</span>
                {SCOPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setScope(opt.id)}
                    className={`px-3 py-1 rounded font-label-code-sm text-label-code-sm flex items-center gap-1.5 transition-colors ${
                      scope === opt.id
                        ? "bg-primary-container text-on-primary-container font-medium"
                        : "bg-surface-container hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/40"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${opt.dotClass}`} />
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <div className="relative inline-flex items-center bg-surface-container border border-outline-variant/40 rounded px-2.5 py-1.5 text-on-surface-variant">
                  <select
                    value={depth}
                    onChange={(e) => setDepth(e.target.value as ResearchDepth)}
                    className="bg-transparent border-0 outline-none font-label-code-sm text-label-code-sm text-on-surface appearance-none cursor-pointer pr-5"
                  >
                    <option value="quick">Quick (~1-2m)</option>
                    <option value="standard">Standard (~4-6m)</option>
                    <option value="deep">Deep (~12-15m)</option>
                  </select>
                  <ChevronDown size={14} className="text-outline absolute right-1.5 pointer-events-none" />
                </div>
                <button
                  type="button"
                  title="Attach a document (not wired up yet)"
                  disabled
                  className="p-2 rounded bg-surface-container text-outline border border-outline-variant/40 opacity-50 cursor-not-allowed"
                >
                  <Paperclip size={16} />
                </button>
                <button
                  type="button"
                  disabled={starting}
                  onClick={() => startResearch()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary font-headline-sm text-headline-sm font-medium hover:bg-primary-container hover:text-on-primary-container shadow-md transition-all group"
                >
                  <span>Start Research</span>
                  <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <DemoScenarios />

        {/* Suggested queries */}
        <section className="flex flex-col gap-3">
          <span className="font-tag-caps text-tag-caps text-outline uppercase tracking-wider">
            Suggested Queries
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {SUGGESTED_QUERIES.map((q) => (
              <button
                key={q.title}
                type="button"
                onClick={() => {
                  setQuery(q.title);
                  startResearch(q.title, q.mode);
                }}
                className="text-left flex flex-col gap-2 p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 hover:border-primary-container hover:bg-surface-container transition-all"
              >
                <span className={`font-tag-caps text-tag-caps uppercase tracking-wider ${q.domainClass}`}>
                  {q.domain}
                </span>
                <span className="font-body-md text-body-md text-on-surface leading-snug">{q.title}</span>
                <span className="font-label-code-sm text-label-code-sm text-outline mt-1">{q.meta}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Recent research */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-headline-md text-headline-md text-on-surface font-semibold">Recent Research</h2>
            <button
              type="button"
              onClick={() => navigate("/history")}
              className="flex items-center gap-1 font-body-sm text-body-sm text-primary hover:text-primary-fixed-dim transition-colors"
            >
              View all <ExternalLink size={14} />
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {recent.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.completed ? `/research/${item.id}/report` : `/research/${item.id}`)}
                className="text-left flex items-center justify-between gap-4 p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 hover:border-primary-container transition-all"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`font-tag-caps text-tag-caps px-1.5 py-0.5 rounded uppercase tracking-wider ${item.domainClass}`}>
                      {item.domainLabel}
                    </span>
                    <span className="font-label-code-sm text-label-code-sm text-outline">{item.caseRef}</span>
                  </div>
                  <span className="font-body-md text-body-md text-on-surface font-medium">{item.title}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {item.completed ? (
                    <span className="font-label-code-sm text-label-code-sm text-tertiary">
                      ✓ {item.sources !== null ? `${item.sources} sources` : "Completed"}
                    </span>
                  ) : item.stopped ? (
                    <span className="font-label-code-sm text-label-code-sm text-error">Stopped</span>
                  ) : (
                    <span className="font-label-code-sm text-label-code-sm text-primary flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      In progress
                    </span>
                  )}
                  <ArrowRight size={16} className="text-outline" />
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
