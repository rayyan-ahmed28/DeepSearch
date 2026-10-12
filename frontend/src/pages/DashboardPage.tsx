import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Brain, ArrowRight, Paperclip, ChevronDown, ShieldCheck, ExternalLink } from "lucide-react";

import AppShell from "@/components/layout/AppShell";

type Scope = "all" | "legal" | "finance" | "patent";

const SCOPE_OPTIONS: { id: Scope; label: string; dotClass: string }[] = [
  { id: "all", label: "All Domains", dotClass: "bg-surface-container-lowest" },
  { id: "legal", label: "Legal Dockets", dotClass: "bg-secondary" },
  { id: "finance", label: "SEC & Earnings", dotClass: "bg-tertiary" },
  { id: "patent", label: "Patent IP", dotClass: "bg-primary-fixed-dim" },
];

const SUGGESTED_QUERIES = [
  {
    domain: "Legal + Finance",
    domainClass: "text-primary",
    title: "Antitrust suit against a mid-cap retailer and its Q3 earnings exposure",
    meta: "Illustrative example",
  },
  {
    domain: "Finance",
    domainClass: "text-tertiary",
    title: "Auditor resignation timeline for a semiconductor supplier and material disclosure deltas",
    meta: "Illustrative example",
  },
  {
    domain: "Legal",
    domainClass: "text-secondary",
    title: "Patent infringement split ruling and its effect on licensing precedent",
    meta: "Illustrative example",
  },
  {
    domain: "Finance",
    domainClass: "text-tertiary",
    title: "Data-breach litigation risk exposure and cyber insurance claims for a cloud vendor",
    meta: "Illustrative example",
  },
];

const RECENT_RESEARCH = [
  {
    id: "demo-1",
    domain: "LEGAL",
    domainClass: "text-secondary bg-secondary/10",
    caseRef: "Docket No. 24-CV-0410",
    title: "Patent Import Ban Appeal: Federal Circuit Review Trace",
    updated: "42m ago",
    status: "completed" as const,
    sources: 114,
  },
  {
    id: "demo-2",
    domain: "LEGAL",
    domainClass: "text-secondary bg-secondary/10",
    caseRef: "N.D. Tex. No. 3:24-cv-00986",
    title: "Non-Compete Rule Injunction: 5th Circuit Briefing Summary",
    updated: "2h ago",
    status: "completed" as const,
    sources: 68,
  },
  {
    id: "demo-3",
    domain: "FINANCE",
    domainClass: "text-tertiary bg-tertiary/10",
    caseRef: "10-Q Filing Review",
    title: "Quarterly Earnings Drivers for a Mid-Cap Logistics Company",
    updated: "running",
    status: "in_progress" as const,
    sources: 18,
  },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [depth, setDepth] = useState("standard");

  function startResearch() {
    navigate("/research/demo-1", { state: { query, depth } });
  }

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
                    onChange={(e) => setDepth(e.target.value)}
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
                  onClick={startResearch}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary font-headline-sm text-headline-sm font-medium hover:bg-primary-container hover:text-on-primary-container shadow-md transition-all group"
                >
                  <span>Start Research</span>
                  <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </section>

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
                  startResearch();
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
            <button className="flex items-center gap-1 font-body-sm text-body-sm text-primary hover:text-primary-fixed-dim transition-colors">
              View all <ExternalLink size={14} />
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {RECENT_RESEARCH.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.status === "completed" ? `/research/${item.id}/report` : `/research/${item.id}`)}
                className="text-left flex items-center justify-between gap-4 p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 hover:border-primary-container transition-all"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`font-tag-caps text-tag-caps px-1.5 py-0.5 rounded uppercase tracking-wider ${item.domainClass}`}>
                      {item.domain}
                    </span>
                    <span className="font-label-code-sm text-label-code-sm text-outline">{item.caseRef}</span>
                    <span className="font-label-code-sm text-label-code-sm text-outline">· {item.updated}</span>
                  </div>
                  <span className="font-body-md text-body-md text-on-surface font-medium">{item.title}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {item.status === "completed" ? (
                    <span className="font-label-code-sm text-label-code-sm text-tertiary">
                      ✓ {item.sources} sources
                    </span>
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
