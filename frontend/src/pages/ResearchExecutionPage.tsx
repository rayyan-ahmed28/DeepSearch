import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, FastForward, FileText, Gavel, LayoutPanelLeft, LineChart, RotateCcw } from "lucide-react";

import AppShell from "@/components/layout/AppShell";
import AgentTopology from "@/components/execution/AgentTopology";
import ActivityFeed from "@/components/execution/ActivityFeed";
import { useResearchStream } from "@/hooks/useResearchStream";
import { AGENTS, LLM_CALL_BUDGET } from "@/lib/executionEvents";
import { domainsForMode, type RunConfig } from "@/lib/runConfig";

const DEFAULT_QUERY = "Sample run: legal dispute and stock impact for a fictional company";

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const CLAIM_CLASS: Record<string, string> = {
  verified: "text-tertiary",
  corroborated: "text-secondary",
  unverified: "text-outline",
  conflicting: "text-error",
};

export default function ResearchExecutionPage() {
  const { id = "demo-1" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const cfg = (location.state ?? {}) as Partial<RunConfig>;
  const query = cfg.query?.trim() || DEFAULT_QUERY;
  const manualOverride = cfg.mode !== undefined && cfg.mode !== "auto";

  const { state, elapsedMs, restart, skipToEnd } = useResearchStream(domainsForMode(cfg.mode), manualOverride);

  const agentsDone = AGENTS.filter((a) => state.agents[a.id].status === "done").length;
  const agentsActive = AGENTS.filter((a) => state.agents[a.id].status !== "skipped").length;
  const progress = state.done ? 100 : Math.round((agentsDone / agentsActive) * 100);
  const verifiedCount = state.claims.filter((c) => c.status === "verified" || c.status === "corroborated").length;

  const stats = [
    { label: "Elapsed", value: formatElapsed(elapsedMs) },
    { label: "LLM calls", value: `${state.llmCalls} / ${LLM_CALL_BUDGET}` },
    { label: "Sources found", value: String(state.sources.length) },
    { label: "Claims checked", value: `${verifiedCount} / ${state.claims.length}` },
  ];

  return (
    <AppShell breadcrumb={`CORE://RESEARCH/${id.toUpperCase()}`}>
      <div className="w-full max-w-[1400px] mx-auto px-8 py-8 flex flex-col gap-6">
        {/* Header */}
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-outline-variant/20">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${state.done ? "bg-tertiary" : "bg-primary animate-pulse"}`} />
              <span className="font-tag-caps text-tag-caps text-outline uppercase tracking-wider">
                {state.done ? "Run complete" : "Run in progress"} · Demo replay of sample events
              </span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface truncate">{query}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              {state.domains.includes("legal") && (
                <span className="flex items-center gap-1.5 font-label-code-sm text-label-code-sm text-secondary bg-secondary/10 rounded px-2 py-0.5">
                  <Gavel size={12} /> Legal
                </span>
              )}
              {state.domains.includes("finance") && (
                <span className="flex items-center gap-1.5 font-label-code-sm text-label-code-sm text-tertiary bg-tertiary/10 rounded px-2 py-0.5">
                  <LineChart size={12} /> Finance
                </span>
              )}
              {state.rationale && <span className="font-body-sm text-body-sm text-outline">{state.rationale}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!state.done && (
              <button
                onClick={skipToEnd}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high transition-colors font-body-md text-body-md"
              >
                <FastForward size={16} /> Skip to end
              </button>
            )}
            <button
              onClick={restart}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high transition-colors font-body-md text-body-md"
            >
              <RotateCcw size={16} /> Replay
            </button>
          </div>
        </header>

        {/* Progress */}
        <div className="h-1 w-full rounded-full bg-surface-container-high overflow-hidden">
          <motion.div className="h-full bg-primary-container" animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-surface-container-low border border-outline-variant/30 px-4 py-3 flex flex-col gap-1">
              <span className="font-tag-caps text-tag-caps text-outline uppercase tracking-wider">{s.label}</span>
              <span className="font-headline-md text-headline-md text-on-surface tabular-nums">{s.value}</span>
            </div>
          ))}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 flex flex-col gap-6">
            <section className="rounded-xl bg-surface-container-low border border-outline-variant/30 p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Agent topology</h2>
                <span className="font-label-code-sm text-label-code-sm text-outline">
                  {agentsDone} / {agentsActive} agents done
                </span>
              </div>
              <AgentTopology agents={state.agents} />
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="rounded-xl bg-surface-container-low border border-outline-variant/30 p-4 flex flex-col gap-3">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Research plan</h2>
                {(["legal", "finance"] as const).map((d) =>
                  state.plans[d] ? (
                    <div key={d} className="flex flex-col gap-1.5">
                      <span className="font-tag-caps text-tag-caps text-outline uppercase tracking-wider">{d}</span>
                      <ul className="flex flex-col gap-1">
                        {state.plans[d]!.map((t) => (
                          <li key={t} className="flex items-start gap-2 font-body-sm text-body-sm text-on-surface-variant">
                            <CheckCircle2 size={14} className="mt-0.5 text-tertiary shrink-0" />
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}
                {!state.plans.legal && !state.plans.finance && (
                  <p className="font-body-sm text-body-sm text-outline">Managers have not produced a plan yet.</p>
                )}
              </section>

              <section className="rounded-xl bg-surface-container-low border border-outline-variant/30 p-4 flex flex-col gap-3">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Sources found</h2>
                <ul className="flex flex-col gap-2 max-h-56 overflow-y-auto">
                  {state.sources.map((s, i) => (
                    <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col">
                      <span className="font-body-sm text-body-sm text-on-surface">{s.title}</span>
                      <span className="font-tag-caps text-tag-caps text-outline uppercase">{s.source_type.replace("_", " ")}</span>
                    </motion.li>
                  ))}
                  {state.sources.length === 0 && <li className="font-body-sm text-body-sm text-outline">No sources yet.</li>}
                </ul>
                {state.claims.length > 0 && (
                  <div className="pt-2 border-t border-outline-variant/20 flex flex-col gap-1">
                    {state.claims.map((c, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 font-body-sm text-body-sm">
                        <span className="text-on-surface-variant truncate">{c.text}</span>
                        <span className={`font-tag-caps text-tag-caps uppercase ${CLAIM_CLASS[c.status]}`}>{c.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>

          {/* Activity feed */}
          <section className="lg:col-span-2 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col h-[640px]">
            <div className="px-4 py-3 border-b border-outline-variant/20 flex items-center justify-between">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Activity feed</h2>
              <span className="font-label-code-sm text-label-code-sm text-outline">{state.logs.length} events</span>
            </div>
            <ActivityFeed logs={state.logs} />
          </section>
        </div>

        {/* Completion actions */}
        {state.done && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-surface-container border border-tertiary/30 px-5 py-4"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="text-tertiary" size={20} />
              <span className="font-body-md text-body-md text-on-surface">Research complete. Report and evidence workspace are ready.</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(`/research/${id}/workspace`)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-outline-variant/40 text-on-surface hover:bg-surface-container-high transition-colors font-body-md text-body-md"
              >
                <LayoutPanelLeft size={16} /> Open workspace
              </button>
              <button
                onClick={() => navigate(`/research/${id}/report`)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-medium hover:opacity-90 transition-opacity font-body-md text-body-md"
              >
                <FileText size={16} /> View report
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </AppShell>
  );
}
