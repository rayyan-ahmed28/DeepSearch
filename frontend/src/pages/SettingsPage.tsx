import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Bell,
  Check,
  CircleCheck,
  CircleDashed,
  Gauge,
  FlaskConical,
  Gavel,
  HardDrive,
  Layers,
  LineChart,
  Loader2,
  Monitor,
  Moon,
  Network,
  Palette,
  PlugZap,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
  Sun,
  Volume2,
} from "lucide-react";

import AppShell from "@/components/layout/AppShell";
import ToggleSwitch from "@/components/common/ToggleSwitch";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import type { ResearchDepth, ResearchMode } from "@/lib/runConfig";
import { APP_VERSION } from "@/lib/version";
import { useRunStore } from "@/store/runStore";
import {
  DEFAULT_SETTINGS,
  playChime,
  resolvedTheme,
  useSettings,
  type Accent,
  type MotionChoice,
  type Scale,
  type ThemeChoice,
} from "@/store/settingsStore";

// What each depth really changes (backend: SOURCES_BY_DEPTH and PERIOD_BY_DEPTH).
const DEPTHS: { id: ResearchDepth; label: string; icon: typeof Gauge; sources: string; period: string; note: string }[] = [
  { id: "quick", label: "Quick", icon: Gauge, sources: "Up to 5 sources per search", period: "3 months of prices", note: "Fastest look at a question." },
  { id: "standard", label: "Standard", icon: Activity, sources: "Up to 8 sources per search", period: "6 months of prices", note: "Balanced; the recommended default." },
  { id: "deep", label: "Deep", icon: FlaskConical, sources: "Up to 12 sources per search", period: "1 year of prices", note: "Widest net; slower and more rate-limit prone." },
];

const MODES: { id: ResearchMode; label: string; icon: typeof Gavel; iconClass: string; note: string }[] = [
  { id: "auto", label: "Automatic", icon: Network, iconClass: "text-primary", note: "The Router decides (one LLM call)" },
  { id: "legal", label: "Legal", icon: Gavel, iconClass: "text-secondary", note: "Courts, regulators, news" },
  { id: "finance", label: "Finance", icon: LineChart, iconClass: "text-tertiary", note: "Prices, filings, calculations" },
  { id: "legal_finance", label: "Legal + Finance", icon: Shuffle, iconClass: "text-on-surface", note: "Both teams in parallel" },
];

const THEMES: { id: ThemeChoice; label: string; icon: typeof Moon; note: string }[] = [
  { id: "dark", label: "Dark", icon: Moon, note: "Charcoal-navy, easy on the eyes" },
  { id: "light", label: "Light", icon: Sun, note: "Bright paper for daylight" },
  { id: "system", label: "System", icon: Monitor, note: "Follows your computer" },
];

// Swatch colours for the picker itself (the applied values live in styles/theme.css).
const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: "indigo", label: "Indigo", swatch: "#8781ff" },
  { id: "rose", label: "Rose", swatch: "#e8648e" },
  { id: "amber", label: "Amber", swatch: "#e0a030" },
  { id: "orchid", label: "Orchid", swatch: "#c26fe2" },
];

const SCALES: { id: Scale; label: string }[] = [
  { id: "small", label: "Compact" },
  { id: "default", label: "Default" },
  { id: "large", label: "Large" },
];

const MOTIONS: { id: MotionChoice; label: string }[] = [
  { id: "system", label: "Follow system" },
  { id: "reduce", label: "Reduce" },
  { id: "full", label: "Full" },
];

export default function SettingsPage() {
  const settings = useSettings();
  const { update, reset } = settings;
  const changed = (Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]).some((k) => settings[k] !== DEFAULT_SETTINGS[k]);

  return (
    <AppShell breadcrumb="CORE://SYSTEM/SETTINGS">
      <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-8 py-8 pb-28 flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <span className="font-label-code-sm text-label-code-sm text-primary">CORE://SYSTEM/SETTINGS</span>
          <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Settings &amp; Research Parameters</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-3xl">
            How DeepSearch looks, what a new research starts with, and what happens when a run finishes. Everything here
            is saved in this browser and applies straight away.
          </p>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* ── Left column ── */}
          <div className="xl:col-span-7 flex flex-col gap-6">
            <Card icon={Layers} title="Default research depth" subtitle="Where New Research and the Dashboard start. You can still change it per run." tag="EXECUTION TIER">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {DEPTHS.map((d) => {
                  const active = settings.defaultDepth === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => update({ defaultDepth: d.id })}
                      className={`relative text-left p-4 rounded-xl border transition-all flex flex-col gap-2 ${
                        active ? "bg-primary/10 border-primary/50" : "bg-surface-container border-outline-variant/30 hover:border-outline"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-headline-md text-headline-md ${active ? "text-primary" : "text-on-surface"}`}>{d.label}</span>
                        <Radio on={active} />
                      </div>
                      <span className="flex items-center gap-1.5 font-label-code-sm text-label-code-sm text-on-surface-variant">
                        <d.icon size={13} /> {d.sources}
                      </span>
                      <span className="font-label-code-sm text-label-code-sm text-outline">{d.period}</span>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">{d.note}</span>
                      {d.id === "standard" && (
                        <span className="absolute top-3 right-10 font-tag-caps text-tag-caps px-1.5 py-0.5 rounded bg-primary/15 text-primary">REC</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card icon={Network} title="Default domains" subtitle="Which research teams a new run uses. Picking one yourself saves the Router's LLM call.">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {MODES.map((m) => {
                  const active = settings.defaultMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => update({ defaultMode: m.id })}
                      className={`text-left p-3 rounded-xl border transition-all flex flex-col gap-1.5 ${
                        active ? "bg-primary/10 border-primary/50" : "bg-surface-container border-outline-variant/30 hover:border-outline"
                      }`}
                    >
                      <m.icon size={18} className={m.iconClass} />
                      <span className="font-headline-sm text-headline-sm text-on-surface">{m.label}</span>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">{m.note}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card icon={Bell} title="When a run finishes" subtitle="Small touches for watching research happen.">
              <div className="flex flex-col gap-1">
                <ToggleSwitch
                  checked={settings.autoOpenReport}
                  onChange={(v) => update({ autoOpenReport: v })}
                  label="Open the report automatically"
                  description="If you are on the Execution screen, jump to the finished report."
                />
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <ToggleSwitch
                      checked={settings.chime}
                      onChange={(v) => {
                        update({ chime: v });
                        if (v) playChime();
                      }}
                      label="Play a chime"
                      description="Two soft notes when a run completes, handy with the tab in the background."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={playChime}
                    title="Play the chime"
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high font-body-sm text-body-sm"
                  >
                    <Volume2 size={14} /> Test
                  </button>
                </div>
                <ToggleSwitch
                  checked={settings.showSampleRuns}
                  onChange={(v) => update({ showSampleRuns: v })}
                  label="Show fictional sample runs"
                  description="List the three Example Corp sample runs under Recent Research on the Dashboard."
                />
              </div>
            </Card>

            <BrowserData />
          </div>

          {/* ── Right column ── */}
          <div className="xl:col-span-5 flex flex-col gap-6">
            <Card icon={Palette} title="Appearance & display" subtitle="Colour scheme, accent, size and motion.">
              <Label>Theme</Label>
              <div className="grid grid-cols-3 gap-3">
                {THEMES.map((t) => {
                  const active = settings.theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => update({ theme: t.id })}
                      className={`text-left rounded-xl border overflow-hidden transition-all ${
                        active ? "border-primary ring-1 ring-primary" : "border-outline-variant/30 hover:border-outline"
                      }`}
                    >
                      <ThemePreview kind={t.id} />
                      <div className="p-2.5 flex flex-col gap-0.5 bg-surface-container">
                        <span className="flex items-center gap-1.5 font-headline-sm text-headline-sm text-on-surface">
                          <t.icon size={14} className={active ? "text-primary" : "text-outline"} /> {t.label}
                        </span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant leading-tight">{t.note}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {settings.theme === "system" && (
                <p className="font-label-code-sm text-label-code-sm text-outline">Your computer is set to {resolvedTheme("system")} mode right now.</p>
              )}

              <Label>Accent colour</Label>
              <div className="flex flex-wrap gap-3">
                {ACCENTS.map((a) => {
                  const active = settings.accent === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => update({ accent: a.id })}
                      className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border transition-all ${
                        active ? "border-primary bg-primary/10" : "border-outline-variant/40 hover:border-outline"
                      }`}
                    >
                      <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: a.swatch }}>
                        {active && <Check size={14} className="text-white" strokeWidth={3} />}
                      </span>
                      <span className="font-body-sm text-body-sm text-on-surface">{a.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="font-body-sm text-body-sm text-outline">
                Recolours buttons, highlights, the logo and the running-agent glow. Legal blue and Finance teal stay fixed, so
                domains read the same everywhere.
              </p>

              <Label>Interface size</Label>
              <Segmented options={SCALES} value={settings.scale} onChange={(scale) => update({ scale })} />

              <Label>Motion</Label>
              <Segmented options={MOTIONS} value={settings.motion} onChange={(m) => update({ motion: m })} />
              <p className="font-body-sm text-body-sm text-outline">
                Reduce stops the pulsing agents and animated transitions. Follow system uses your computer's accessibility setting.
              </p>
            </Card>

            <Diagnostics />
          </div>
        </div>
      </div>

      {/* Footer bar */}
      <div className="print:hidden fixed bottom-0 left-0 lg:left-60 right-0 z-30 border-t border-outline-variant/20 bg-surface/90 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 h-14 flex items-center justify-between gap-4">
          <span className="flex items-center gap-2 font-label-code-sm text-label-code-sm text-on-surface-variant">
            <span className="w-2 h-2 rounded-full bg-tertiary" />
            Saved automatically in this browser
          </span>
          <button
            type="button"
            disabled={!changed}
            onClick={reset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface hover:bg-surface-container-high font-body-sm text-body-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw size={14} /> Reset to defaults
          </button>
        </div>
      </div>
    </AppShell>
  );
}

// ── Building blocks ────────────────────────────────────────────────
function Card({ icon: Icon, title, subtitle, tag, children }: { icon: typeof Palette; title: string; subtitle: string; tag?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface-container-low border border-outline-variant/30 p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2.5 font-headline-md text-headline-md text-on-surface">
            <Icon size={20} className="text-primary" /> {title}
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">{subtitle}</p>
        </div>
        {tag && (
          <span className="shrink-0 font-tag-caps text-tag-caps px-2 py-1 rounded bg-surface-container-high text-on-surface-variant border border-outline-variant/30">
            {tag}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className="font-tag-caps text-tag-caps text-outline uppercase tracking-wider pt-1">{children}</span>;
}

function Radio({ on }: { on: boolean }) {
  return (
    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${on ? "border-primary" : "border-outline-variant"}`}>
      {on && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
    </span>
  );
}

function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="relative grid p-1 rounded-xl bg-surface-container border border-outline-variant/30" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.id)}
            className={`relative z-10 py-2 rounded-lg font-body-sm text-body-sm transition-colors ${active ? "text-on-primary-container font-medium" : "text-on-surface-variant hover:text-on-surface"}`}
          >
            {active && (
              <motion.span layoutId={`seg-${options.map((x) => x.id).join("-")}`} className="absolute inset-0 -z-10 rounded-lg bg-primary-container" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A tiny picture of each theme. Fixed colours on purpose: it shows the other theme too. */
function ThemePreview({ kind }: { kind: ThemeChoice }) {
  const dark = { bg: "#121318", side: "#0d0e13", card: "#1e1f25", line: "#464555", text: "#e3e1e9" };
  const light = { bg: "#fbf8ff", side: "#ffffff", card: "#efedf6", line: "#c9c6d6", text: "#1b1b21" };
  const pane = (c: typeof dark, accent: string) => (
    <div className="h-full flex" style={{ background: c.bg }}>
      <div className="w-1/4 h-full flex flex-col gap-1 p-1.5" style={{ background: c.side, borderRight: `1px solid ${c.line}` }}>
        <span className="h-1 rounded-full" style={{ background: accent }} />
        <span className="h-1 rounded-full opacity-50" style={{ background: c.text }} />
        <span className="h-1 rounded-full opacity-30" style={{ background: c.text }} />
      </div>
      <div className="flex-1 p-1.5 flex flex-col gap-1">
        <span className="h-1.5 w-2/3 rounded-full opacity-70" style={{ background: c.text }} />
        <div className="flex-1 rounded" style={{ background: c.card, border: `1px solid ${c.line}` }} />
        <span className="h-1.5 w-1/3 rounded-full" style={{ background: accent }} />
      </div>
    </div>
  );
  return (
    <div className="h-16 w-full overflow-hidden">
      {kind === "dark" && pane(dark, "#8781ff")}
      {kind === "light" && pane(light, "#6158e8")}
      {kind === "system" && (
        <div className="h-full grid grid-cols-2">
          <div className="overflow-hidden">{pane(dark, "#8781ff")}</div>
          <div className="overflow-hidden">{pane(light, "#6158e8")}</div>
        </div>
      )}
    </div>
  );
}

// ── Data kept in this browser ──────────────────────────────────────
function BrowserData() {
  const runs = useRunStore((s) => s.runs);
  const forgetRun = useRunStore((s) => s.forgetRun);
  const [confirming, setConfirming] = useState(false);
  const local = Object.values(runs).filter((r) => !r.sample);
  return (
    <Card icon={HardDrive} title="Data in this browser" subtitle="What this browser remembers. The backend's saved history is separate and stays.">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-surface-container border border-outline-variant/30">
        <div className="flex flex-col">
          <span className="font-headline-sm text-headline-sm text-on-surface">
            {local.length} run{local.length === 1 ? "" : "s"} remembered here
          </span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            Clearing forgets them in this browser only. Backend runs can be reopened from Research History.
          </span>
        </div>
        {confirming ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                local.forEach((r) => forgetRun(r.id));
                setConfirming(false);
              }}
              className="px-3 py-1.5 rounded-lg bg-error text-on-error font-body-sm text-body-sm font-medium"
            >
              Clear
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="px-3 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface-variant font-body-sm text-body-sm">
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={local.length === 0}
            onClick={() => setConfirming(true)}
            className="px-3 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:text-error hover:border-error/40 font-body-sm text-body-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear list
          </button>
        )}
      </div>
    </Card>
  );
}

// ── About & diagnostics (real values from /api/health) ─────────────
function Diagnostics() {
  const { snapshot, refresh } = useBackendHealth();
  const [testing, setTesting] = useState(false);
  const h = snapshot?.health;

  async function test() {
    setTesting(true);
    await refresh();
    setTesting(false);
  }

  const providers: { label: string; on: boolean | undefined; on_text: string; off_text: string }[] = [
    { label: "Gemini (LLM)", on: h?.providers.gemini, on_text: "key set", off_text: "not set: rule-based stand-in" },
    { label: "Tavily (web search)", on: h?.providers.tavily, on_text: "key set", off_text: "not set: DuckDuckGo" },
    { label: "CourtListener", on: h?.providers.courtlistener, on_text: "token set", off_text: "no token: low rate limit" },
    { label: "SEC EDGAR", on: h?.providers.sec_edgar, on_text: "contact set", off_text: "off: set SEC_EDGAR_USER_AGENT" },
  ];

  return (
    <Card icon={SlidersHorizontal} title="About & diagnostics" subtitle="What is running right now, read from the backend. Key values are never shown.">
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container border border-outline-variant/30">
        <div className="flex items-center gap-2.5">
          {snapshot === undefined ? (
            <Loader2 size={16} className="text-outline animate-spin" />
          ) : snapshot ? (
            <span className="relative flex w-2.5 h-2.5">
              <span className="absolute inset-0 rounded-full bg-tertiary animate-ping opacity-60" />
              <span className="relative w-2.5 h-2.5 rounded-full bg-tertiary" />
            </span>
          ) : (
            <span className="w-2.5 h-2.5 rounded-full bg-error" />
          )}
          <div className="flex flex-col">
            <span className="font-headline-sm text-headline-sm text-on-surface">
              {snapshot === undefined ? "Checking the backend" : snapshot ? "Backend connected" : "Backend not running"}
            </span>
            <span className="font-label-code-sm text-label-code-sm text-outline">
              {snapshot ? `Round trip ${snapshot.latencyMs} ms · API v${snapshot.health.version}` : snapshot === null ? "New runs use the fictional sample replay" : " "}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={test}
          disabled={testing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high font-body-sm text-body-sm disabled:opacity-50"
        >
          <PlugZap size={14} /> {testing ? "Testing" : "Test connection"}
        </button>
      </div>

      <dl className="flex flex-col divide-y divide-outline-variant/20">
        <Row label="Mode" value={!h ? "Sample replay" : h.llm_provider === "gemini" ? `Live · ${h.llm_model ?? "Gemini"}` : "Live data · rule-based stand-in"} />
        <Row label="Web search" value={h?.web_search ?? "—"} />
        <Row label="LLM calls per run" value={h ? `at most ${h.llm_call_budget}` : "—"} />
        <Row label="Recorded demo scenarios" value={h ? String(h.scenarios) : "—"} />
        <Row label="Runs in saved history" value={h ? String(h.history_runs) : "—"} />
        <Row label="App version" value={`v${APP_VERSION}`} />
      </dl>

      <Label>Data services</Label>
      <ul className="flex flex-col gap-2">
        {providers.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-3 font-body-md text-body-md">
            <span className="flex items-center gap-2 text-on-surface">
              {p.on ? <CircleCheck size={15} className="text-tertiary" /> : <CircleDashed size={15} className="text-outline" />}
              {p.label}
            </span>
            <span className={`font-label-code-sm text-label-code-sm ${p.on ? "text-tertiary" : "text-outline"}`}>
              {h ? (p.on ? p.on_text : p.off_text) : "—"}
            </span>
          </li>
        ))}
      </ul>
      <p className="font-body-sm text-body-sm text-outline">
        Keys live in <span className="font-label-code-sm text-label-code-sm">backend/.env</span>; restart the backend after
        changing them. All of these services are free.
      </p>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="font-body-md text-body-md text-on-surface-variant">{label}</dt>
      <dd className="font-label-code-md text-label-code-md text-on-surface text-right">{value}</dd>
    </div>
  );
}
