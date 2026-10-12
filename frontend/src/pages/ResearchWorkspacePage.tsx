import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FileText, Network } from "lucide-react";

import AppShell from "@/components/layout/AppShell";
import RunNotFound from "@/components/common/RunNotFound";
import RunErrorBanner from "@/components/common/RunErrorBanner";
import AgentPanel from "@/components/workspace/AgentPanel";
import FindingCard from "@/components/workspace/FindingCard";
import PriceChartCard from "@/components/workspace/PriceChartCard";
import SourceList from "@/components/workspace/SourceList";
import TimelineCard from "@/components/workspace/TimelineCard";
import { useNow, useRun } from "@/hooks/useRun";
import { AGENTS, type ClaimPayload, type SourcePayload } from "@/lib/executionEvents";
import { formatElapsed } from "@/lib/format";
import type { SourceFilter } from "@/lib/labels";
import { chartCaption as captionFor, engineLabel, isRunActive, runElapsedMs, useRunStore } from "@/store/runStore";

type FindingFilter = "all" | "legal" | "finance" | "cross";

const FINDING_FILTERS: { id: FindingFilter; label: string; match: (c: ClaimPayload) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "legal", label: "Legal", match: (c) => c.domain === "legal" },
  { id: "finance", label: "Finance", match: (c) => c.domain === "finance" },
  { id: "cross", label: "Cross-domain", match: (c) => c.domain === null },
];

export default function ResearchWorkspacePage() {
  const { id = "demo-1" } = useParams();
  const { run, missing } = useRun(id);
  const breadcrumb = `CORE://RESEARCH/${id.toUpperCase()}/WORKSPACE`;
  if (missing) {
    return (
      <AppShell breadcrumb={breadcrumb}>
        <RunNotFound id={id} />
      </AppShell>
    );
  }
  if (!run) return <AppShell breadcrumb={breadcrumb}>{null}</AppShell>;
  return (
    <AppShell breadcrumb={breadcrumb}>
      <WorkspaceView id={id} />
    </AppShell>
  );
}

function WorkspaceView({ id }: { id: string }) {
  const navigate = useNavigate();
  const run = useRunStore((s) => s.runs[id])!;
  const state = run.state;
  const now = useNow(isRunActive(run));
  const finished = !isRunActive(run);
  const chartCaption = captionFor(run);

  const [findingFilter, setFindingFilter] = useState<FindingFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  const { sourcesById, citationNumber, citedBy } = useMemo(() => {
    const byId: Record<string, SourcePayload> = {};
    const number: Record<string, number> = {};
    state.sources.forEach((s, i) => {
      byId[s.id] = s;
      number[s.id] = i + 1;
    });
    const cited: Record<string, number> = {};
    for (const c of state.claims) for (const sid of c.source_ids) cited[sid] = (cited[sid] ?? 0) + 1;
    return { sourcesById: byId, citationNumber: number, citedBy: cited };
  }, [state.sources, state.claims]);

  const activeFilter = FINDING_FILTERS.find((f) => f.id === findingFilter)!;
  const findings = state.claims.filter(activeFilter.match);
  const supported = state.claims.filter((c) => c.verification === "verified" || c.verification === "corroborated").length;
  const showChart = findingFilter === "all" || findingFilter === "finance" || findingFilter === "cross";
  const showTimeline = findingFilter === "all" || findingFilter === "legal";

  const agentsDone = AGENTS.filter((a) => state.agents[a.id].status === "done").length;
  const agentsActive = AGENTS.filter((a) => state.agents[a.id].status !== "skipped").length;
  const progress = state.done ? 100 : Math.round((agentsDone / agentsActive) * 100);

  const toggleSource = (sid: string) => setSelectedSourceId((cur) => (cur === sid ? null : sid));

  const telemetry = [
    { label: "Elapsed", value: formatElapsed(runElapsedMs(run, now)) },
    { label: "Findings", value: String(state.claims.length) },
    { label: "Sources", value: String(state.sources.length) },
    { label: "Verified or corroborated", value: `${supported} / ${state.claims.length}` },
  ];

  return (
    <div className="flex flex-col w-full">
      {/* Query and status bar */}
      <header className="bg-surface-container-lowest border-b border-outline-variant/30 px-8 py-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-tag-caps text-tag-caps text-primary border border-primary/30 bg-primary/10 px-2 py-0.5 rounded uppercase">
                {engineLabel(run).badge}
              </span>
              {run.sample && (
                <span className="font-tag-caps text-tag-caps text-outline border border-outline-variant/40 px-2 py-0.5 rounded uppercase">
                  Fictional sample
                </span>
              )}
              <span className="font-label-code-sm text-label-code-sm text-outline">ID: {id}</span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight truncate">{run.config.query}</h1>
          </div>
          <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
            <button
              type="button"
              onClick={() => navigate(`/research/${id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant/40 hover:border-outline text-on-surface font-body-sm text-body-sm transition-colors"
            >
              <Network size={16} className="text-outline" /> Execution view
            </button>
            <button
              type="button"
              disabled={!state.done}
              title={state.done ? undefined : "Available when the run completes"}
              onClick={() => navigate(`/research/${id}/report`)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary-container text-on-primary-container font-body-md text-body-md font-medium transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileText size={16} /> View report
            </button>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-y-2 gap-x-6 font-label-code-sm text-label-code-sm text-on-surface-variant">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${state.error ? "bg-error" : state.done ? "bg-tertiary" : "bg-primary animate-pulse"}`}
              />
              <span className="text-on-surface font-medium uppercase tracking-wider">
                {state.error ? "Run stopped" : state.done ? "Run complete" : "Run in progress"}
              </span>
            </div>
            {telemetry.map((t) => (
              <div key={t.label} className="flex items-center gap-1.5">
                <span className="text-outline uppercase">{t.label}:</span>
                <span className="text-on-surface tabular-nums">{t.value}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-outline uppercase">Progress:</span>
            <span className="text-primary font-semibold tabular-nums">{progress}%</span>
            <div className="w-24 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
              <div className="h-full bg-primary-container rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
        {state.error && (
          <div className="mt-4">
            <RunErrorBanner message={state.error} />
          </div>
        )}
      </header>

      {/* Three-panel workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 bg-surface">
        <aside className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-outline-variant/30 bg-surface-container-lowest/80 p-4 lg:sticky lg:top-16 lg:self-start lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto">
          <AgentPanel state={state} />
        </aside>

        <section className="lg:col-span-6 p-4 flex flex-col gap-4 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-outline-variant/20">
            <div className="flex items-center gap-2">
              <h2 className="font-headline-sm text-headline-sm text-on-surface uppercase">Findings</h2>
              <span className="font-label-code-sm text-label-code-sm text-outline">({state.claims.length} total)</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {FINDING_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFindingFilter(f.id)}
                  className={`px-2.5 py-1 rounded-md font-label-code-sm text-xs transition-colors ${
                    findingFilter === f.id
                      ? "bg-primary-container text-on-primary-container font-medium"
                      : "bg-surface-container hover:bg-surface-container-high text-on-surface-variant"
                  }`}
                >
                  {f.label} ({state.claims.filter(f.match).length})
                </button>
              ))}
            </div>
          </div>

          {state.claims.length === 0 && (
            <div className="p-4 rounded-xl bg-surface-container-low border border-dashed border-outline-variant/40 flex flex-col gap-3">
              <p className="font-body-md text-body-md text-on-surface-variant">
                {finished
                  ? "No findings: nothing this run retrieved supported a claim. Without a Gemini key, findings come only from structured records (price data, SEC filings, court dockets). Any sources found are on the right."
                  : "Findings appear once Verification has extracted the claims and checked each one against its sources."}
              </p>
              {(["legal", "finance"] as const).map((d) =>
                state.plans[d] ? (
                  <div key={d} className="flex flex-col gap-1">
                    <span className="font-tag-caps text-tag-caps text-outline uppercase">{d} plan</span>
                    <ul className="list-disc pl-5 font-body-sm text-body-sm text-on-surface-variant">
                      {state.plans[d]!.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          )}
          {state.claims.length > 0 && findings.length === 0 && (
            <p className="font-body-sm text-body-sm text-outline">No findings in this category for this run.</p>
          )}

          {findings.map((c) => (
            <FindingCard
              key={c.id}
              claim={c}
              sourcesById={sourcesById}
              citationNumber={citationNumber}
              selectedSourceId={selectedSourceId}
              onSelectSource={toggleSource}
            />
          ))}

          {showChart &&
            state.charts.map((chart) => (
              <PriceChartCard
                key={chart.id}
                chart={chart}
                markers={state.timeline}
                calculations={state.calculations}
                caption={chartCaption}
              />
            ))}
          {showTimeline && state.timeline.length > 0 && (
            <TimelineCard events={state.timeline} citationNumber={citationNumber} onSelectSource={toggleSource} />
          )}
        </section>

        <aside className="lg:col-span-3 border-t lg:border-t-0 lg:border-l border-outline-variant/30 bg-surface-container-lowest/80 p-4 lg:sticky lg:top-16 lg:self-start lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto">
          <SourceList
            sources={state.sources}
            citationNumber={citationNumber}
            citedBy={citedBy}
            filter={sourceFilter}
            onFilter={setSourceFilter}
            selectedSourceId={selectedSourceId}
            onSelectSource={toggleSource}
          />
        </aside>
      </div>
    </div>
  );
}
