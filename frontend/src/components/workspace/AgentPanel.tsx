import { CheckCircle2, CircleSlash, Network, XCircle } from "lucide-react";

import { AGENTS, KIND_LABEL, LLM_CALL_BUDGET, type AgentStatus } from "@/lib/executionEvents";
import type { StreamState } from "@/lib/streamReducer";

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "Waiting",
  running: "Running",
  done: "Completed",
  skipped: "Skipped",
  error: "Failed",
};

const STATUS_CLASS: Record<AgentStatus, string> = {
  idle: "text-outline",
  running: "text-primary",
  done: "text-tertiary",
  skipped: "text-outline-variant",
  error: "text-error",
};

function StatusIcon({ status }: { status: AgentStatus }) {
  if (status === "done") return <CheckCircle2 size={12} />;
  if (status === "error") return <XCircle size={12} />;
  if (status === "skipped") return <CircleSlash size={12} />;
  if (status === "running") return <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />;
  return null;
}

export default function AgentPanel({ state }: { state: StreamState }) {
  const active = AGENTS.filter((a) => state.agents[a.id].status !== "skipped").length;
  const budgetPct = Math.min(100, Math.round((state.llmCalls / LLM_CALL_BUDGET) * 100));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
        <div className="flex items-center gap-2">
          <span className="font-tag-caps text-tag-caps uppercase text-outline">Agents</span>
          <span className="px-1.5 rounded bg-surface-container-high text-primary font-label-code-sm text-[10px]">
            {active} IN THIS RUN
          </span>
        </div>
        <Network size={16} className="text-outline" />
      </div>

      <div className="flex flex-col gap-1.5">
        {AGENTS.map((a) => {
          const { status, detail, lastLog } = state.agents[a.id];
          const running = status === "running";
          const line =
            status === "skipped"
              ? detail ?? "Not needed for this run"
              : running
                ? detail ?? lastLog ?? "Working"
                : lastLog ?? (status === "idle" ? "Waiting for upstream agents" : "");
          return (
            <div
              key={a.id}
              className={`relative overflow-hidden p-2.5 rounded-lg border transition-colors ${
                running
                  ? "bg-surface-container border-primary/40"
                  : status === "skipped"
                    ? "bg-surface-container-lowest border-outline-variant/10"
                    : "bg-surface-container-low border-outline-variant/20"
              }`}
            >
              {running && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary animate-pulse" />}
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-body-sm text-body-sm font-medium ${status === "skipped" ? "text-outline" : "text-on-surface"}`}
                >
                  {a.label}
                </span>
                <span
                  className={`flex items-center gap-1 font-label-code-sm text-[10px] font-semibold uppercase ${STATUS_CLASS[status]}`}
                >
                  <StatusIcon status={status} />
                  {STATUS_LABEL[status]}
                </span>
              </div>
              <div className="mt-1 flex items-start justify-between gap-2 font-label-code-sm text-[11px]">
                <span className={running ? "text-on-surface-variant" : "text-outline"}>{line}</span>
                <span className={`shrink-0 ${a.kind === "tool" ? "text-tertiary/70" : "text-primary/70"}`}>
                  {KIND_LABEL[a.kind]}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/30 flex flex-col gap-2">
        <div className="flex items-center justify-between font-tag-caps text-tag-caps uppercase text-outline">
          <span>LLM call budget</span>
          <span className="font-label-code-sm text-label-code-sm text-on-surface normal-case">
            {state.llmCalls} / {LLM_CALL_BUDGET}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-container-high overflow-hidden">
          <div className="h-full bg-primary-container rounded-full transition-all" style={{ width: `${budgetPct}%` }} />
        </div>
        <p className="font-body-sm text-body-sm text-outline">
          Only the Router, Managers, Verification and Report Architect call an LLM. Search, data and maths are plain code.
        </p>
      </div>
    </div>
  );
}
