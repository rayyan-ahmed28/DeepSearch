import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Brain,
  Paperclip,
  Network,
  Gavel,
  LineChart,
  Shuffle,
  CheckCircle2,
  Circle,
  Gauge,
  FlaskConical,
  ChevronDown,
  RotateCcw,
  Activity,
  SlidersHorizontal,
} from "lucide-react";

import AppShell from "@/components/layout/AppShell";
import ToggleSwitch from "@/components/common/ToggleSwitch";
import type { ResearchDepth, ResearchMode } from "@/lib/runConfig";
import { useRunStore } from "@/store/runStore";
import { useSettings } from "@/store/settingsStore";

type DomainId = ResearchMode;
type DepthId = ResearchDepth;

const DOMAINS: { id: DomainId; icon: typeof Network; iconClass: string; title: string; badge?: string; description: string }[] = [
  { id: "auto", icon: Network, iconClass: "bg-primary/10 text-primary", title: "Automatic", badge: "Router", description: "AI domain routing — auto-detects legal & financial scope" },
  { id: "legal", icon: Gavel, iconClass: "bg-secondary/10 text-secondary", title: "Legal", description: "Court records, federal dockets, state precedents, appellate records" },
  { id: "finance", icon: LineChart, iconClass: "bg-tertiary/10 text-tertiary", title: "Finance", description: "SEC filings, financial ratios, market data" },
  { id: "legal_finance", icon: Shuffle, iconClass: "bg-surface-container-highest text-on-surface", title: "Legal + Finance", badge: "Dual-Domain", description: "Simultaneous legal research and financial analysis" },
];

const DEPTHS: { id: DepthId; label: string; runtime: string; runtimeClass: string; icon: typeof Gauge; description: string; level: string; agents: string }[] = [
  { id: "quick", label: "Quick", runtime: "~1-2 min runtime", runtimeClass: "text-secondary", icon: Gauge, description: "Surface-level overview and recent headline disclosures.", level: "DEPTH LVL 1", agents: "Fewer sources" },
  { id: "standard", label: "Standard", runtime: "~4-6 min runtime", runtimeClass: "text-primary", icon: Activity, description: "Balanced cross-referencing with a single verification pass.", level: "DEPTH LVL 2", agents: "Recommended" },
  { id: "deep", label: "Deep", runtime: "~12-15 min runtime", runtimeClass: "text-tertiary", icon: FlaskConical, description: "Exhaustive cross-audit with a second verification pass.", level: "DEPTH LVL 3", agents: "Most thorough" },
];

const DEFAULT_TOGGLES = {
  officialOnly: true,
  regulatory: true,
  companyStatements: true,
  reputableNews: false,
  includeCharts: true,
  includeTimeline: true,
  includeFinancialAnalysis: true,
  showEvidencePanel: true,
};

export default function NewResearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  // Starting values come from Settings → Research defaults; ?mode= (the sidebar shortcuts) wins.
  const [params] = useSearchParams();
  const modeParam = DOMAINS.find((d) => d.id === params.get("mode"))?.id;
  const [domain, setDomain] = useState<DomainId>(() => modeParam ?? useSettings.getState().defaultMode);
  useEffect(() => {
    if (modeParam) setDomain(modeParam);
  }, [modeParam]);
  const [depth, setDepth] = useState<DepthId>(() => useSettings.getState().defaultDepth);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [toggles, setToggles] = useState(DEFAULT_TOGGLES);
  const startRun = useRunStore((s) => s.startRun);
  const [starting, setStarting] = useState(false);

  function updateToggle(key: keyof typeof DEFAULT_TOGGLES, value: boolean) {
    setToggles((prev) => ({ ...prev, [key]: value }));
  }

  async function startResearch() {
    if (starting) return;
    setStarting(true);
    const id = await startRun({ query, mode: domain, depth });
    navigate(`/research/${id}`);
  }

  // Re-register when the form changes, so Ctrl/Cmd+Enter submits the
  // current values instead of the ones from the first render.
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") startResearch();
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, domain, depth]);

  return (
    <AppShell breadcrumb="CORE://RESEARCH/NEW_QUERY">
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-8 py-10 flex flex-col gap-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">
              Start a new research query
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              Configure the target domain and research depth to start a multi-agent investigation.
            </p>
          </div>
          <Link
            to="/settings"
            title="Starting depth and domains come from Settings"
            className="flex items-center gap-2 self-start md:self-center px-4 py-1.5 rounded-full bg-surface-container-low border border-outline-variant/30 hover:border-primary/50 shadow-sm transition-colors"
          >
            <SlidersHorizontal size={13} className="text-primary" />
            <span className="font-label-code-sm text-label-code-sm text-on-surface-variant tracking-wider">DEFAULTS FROM SETTINGS</span>
          </Link>
        </div>

        {/* Query input */}
        <section className="flex flex-col rounded-xl bg-surface-container-low p-6 shadow-md">
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <Brain size={18} className="text-primary" />
              <label htmlFor="research-prompt" className="font-label-code-md text-label-code-md text-on-surface tracking-wide">
                RESEARCH QUESTION
              </label>
            </div>
          </div>
          <textarea
            id="research-prompt"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="E.g., How could a recent lawsuit against a company affect its stock price?"
            rows={5}
            className="w-full bg-surface-container-lowest text-on-surface font-body-lg text-body-lg p-4 rounded-lg outline-none resize-none placeholder:text-outline-variant focus:bg-surface-container-high transition-colors"
          />
          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 mt-1">
            <button
              type="button"
              disabled
              title="Not wired up yet"
              className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant text-body-sm font-body-sm opacity-50 cursor-not-allowed"
            >
              <Paperclip size={16} className="text-outline" />
              <span>Attach a document</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="hidden sm:flex items-center gap-1 font-label-code-sm text-label-code-sm text-outline">
                <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">⌘</span>
                <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">Enter</span>
                <span className="ml-1">to start</span>
              </span>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Domain selection */}
          <section className="lg:col-span-5 flex flex-col gap-3">
            <span className="font-tag-caps text-tag-caps text-outline uppercase tracking-wider">
              Investigation Domain
            </span>
            <div className="flex flex-col gap-2">
              {DOMAINS.map((d) => {
                const Icon = d.icon;
                const active = domain === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDomain(d.id)}
                    className={`flex items-center justify-between p-4 rounded-xl transition-all text-left ${
                      active ? "bg-surface-container-high shadow-sm" : "bg-surface-container-low hover:bg-surface-container-high"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${d.iconClass}`}>
                        <Icon size={20} />
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-headline-sm text-headline-sm text-on-surface">{d.title}</span>
                          {d.badge && (
                            <span className="font-tag-caps text-tag-caps px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container font-semibold">
                              {d.badge}
                            </span>
                          )}
                        </div>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">{d.description}</span>
                      </div>
                    </div>
                    {active ? (
                      <CheckCircle2 size={20} className="text-primary shrink-0" />
                    ) : (
                      <Circle size={20} className="text-outline-variant shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Depth selection */}
          <section className="lg:col-span-7 flex flex-col gap-3">
            <span className="font-tag-caps text-tag-caps text-outline uppercase tracking-wider">
              Research Depth
            </span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 h-full">
              {DEPTHS.map((d) => {
                const Icon = d.icon;
                const active = depth === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDepth(d.id)}
                    className={`flex flex-col justify-between p-4 rounded-xl text-left transition-all ${
                      active ? "bg-surface-container-high shadow-sm" : "bg-surface-container-low hover:bg-surface-container-high"
                    }`}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className={`font-headline-md text-headline-md text-on-surface ${active ? "font-semibold" : ""}`}>
                          {d.label}
                        </span>
                        <Icon size={20} className={active ? d.runtimeClass : "text-outline-variant"} />
                      </div>
                      <span className={`font-label-code-sm text-label-code-sm font-semibold ${d.runtimeClass}`}>
                        {d.runtime}
                      </span>
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{d.description}</p>
                    </div>
                    <div className="pt-4 mt-2 flex items-center justify-between">
                      <span className="font-tag-caps text-tag-caps text-outline">{d.level}</span>
                      <span className="font-label-code-sm text-label-code-sm text-outline-variant">{d.agents}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Advanced options */}
        <section className="flex flex-col rounded-xl bg-surface-container-low p-6 shadow-sm">
          <div className="flex items-center justify-between pb-3">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex items-center gap-2 text-left group"
            >
              <ChevronDown
                size={20}
                className={`text-primary transition-transform duration-200 ${advancedOpen ? "" : "-rotate-90"}`}
              />
              <span className="font-label-code-md text-label-code-md text-on-surface font-medium group-hover:text-primary transition-colors">
                ADVANCED OPTIONS
              </span>
            </button>
            <button
              type="button"
              onClick={() => setToggles(DEFAULT_TOGGLES)}
              className="font-label-code-sm text-label-code-sm text-outline hover:text-on-surface flex items-center gap-1 transition-colors"
            >
              <RotateCcw size={14} />
              <span>Reset defaults</span>
            </button>
          </div>

          {advancedOpen && (
            <p className="font-body-sm text-body-sm text-outline -mt-2">
              Preview: these source and output preferences are not sent to the backend yet. Every run uses the full
              source hierarchy and includes charts, timeline and evidence where its domains need them.
            </p>
          )}
          {advancedOpen && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 pt-2">
              <ToggleSwitch
                checked={toggles.officialOnly}
                onChange={(v) => updateToggle("officialOnly", v)}
                label="Official sources only"
                description="Restrict citations to EDGAR, PACER, CourtListener, and state registrars"
              />
              <ToggleSwitch
                checked={toggles.regulatory}
                onChange={(v) => updateToggle("regulatory", v)}
                label="Regulatory sources"
                description="Include FTC, DOJ, SEC, and CFPB regulatory filings"
              />
              <ToggleSwitch
                checked={toggles.companyStatements}
                onChange={(v) => updateToggle("companyStatements", v)}
                label="Company statements"
                description="Pull corporate releases and investor disclosures"
              />
              <ToggleSwitch
                checked={toggles.reputableNews}
                onChange={(v) => updateToggle("reputableNews", v)}
                label="Reputable news"
                description="Permit tier-1 investigative journalism sources"
              />
              <ToggleSwitch
                checked={toggles.includeCharts}
                onChange={(v) => updateToggle("includeCharts", v)}
                label="Include charts"
                description="Synthesize price and market-data visualizations"
              />
              <ToggleSwitch
                checked={toggles.includeTimeline}
                onChange={(v) => updateToggle("includeTimeline", v)}
                label="Include timeline"
                description="Construct a chronological event timeline"
              />
              <ToggleSwitch
                checked={toggles.includeFinancialAnalysis}
                onChange={(v) => updateToggle("includeFinancialAnalysis", v)}
                label="Include financial analysis"
                description="Generate deterministic financial calculations"
              />
              <ToggleSwitch
                checked={toggles.showEvidencePanel}
                onChange={(v) => updateToggle("showEvidencePanel", v)}
                label="Show evidence panel"
                description="Keep the source/citation drawer visible alongside findings"
              />
            </div>
          )}
        </section>

        {/* Footer action bar */}
        <div className="flex items-center justify-between gap-4 pb-4">
          <button
            type="button"
            className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Save query template
          </button>
          <button
            type="button"
            onClick={startResearch}
            disabled={starting}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-on-primary font-headline-sm text-headline-sm font-medium hover:bg-primary-container hover:text-on-primary-container shadow-md transition-all disabled:opacity-60 disabled:cursor-wait"
          >
            <span>Start Research</span>
          </button>
        </div>
      </div>
    </AppShell>
  );
}
