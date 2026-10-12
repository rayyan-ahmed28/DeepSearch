import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpenCheck,
  Calculator,
  Database,
  FileSearch,
  Gavel,
  LineChart,
  ListChecks,
  MessageSquareText,
  Network,
  PlayCircle,
  ScrollText,
} from "lucide-react";

import BrandMark from "@/components/common/BrandMark";
import ThemeToggle from "@/components/common/ThemeToggle";
import AgentTopology from "@/components/execution/AgentTopology";
import { useLoopingSample } from "@/hooks/useLoopingSample";
import { AGENT_LABEL, type ClaimType } from "@/lib/executionEvents";
import { CLAIM_TYPE_CLASS, CLAIM_TYPE_LABEL, domainChip } from "@/lib/labels";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// Replaces the mockup's marketing counters with statements the code makes true.
const PROOF = [
  { value: "Every claim", label: "cited to a source this run retrieved" },
  { value: "Code-filled", label: "figures in the narrative come from stored calculations" },
  { value: "≤ 8", label: "LLM calls per run, enforced by a budget" },
  { value: "7 labels", label: "keep allegations apart from facts" },
];

const STEPS = [
  { icon: MessageSquareText, title: "Ask", body: "Type a question in plain language. Pick Legal, Finance or both, or let the Router decide." },
  { icon: Network, title: "Plan", body: "A manager agent per domain turns the question into tasks: a court search, a ticker and a time period." },
  { icon: FileSearch, title: "Gather", body: "Plain code, not AI, searches court dockets, SEC filings and the web, and computes returns and volatility." },
  { icon: ListChecks, title: "Verify", body: "Claims are linked to their sources, and rules in code mark each verified, corroborated, unverified or conflicting." },
  { icon: ScrollText, title: "Report", body: "Only the sections the question needs, a citation on every paragraph, and an integrity check before release." },
];

const LEGAL_SOURCES = ["Federal court dockets (CourtListener)", "Regulators and official sites", "Reputable news", "Company statements"];
const FINANCE_SOURCES = ["SEC filings (EDGAR)", "Daily prices (Yahoo Finance)", "Returns and volatility in pandas", "Price moves around each results filing"];

const CLAIM_TYPES: ClaimType[] = ["established_fact", "allegation", "party_claim", "company_statement", "regulatory_statement", "news_report", "analysis"];

// The three recorded demo scenarios (backend/app/demo/scenarios).
const EXAMPLES: { domains: ("legal" | "finance")[]; question: string; outcome: string }[] = [
  {
    domains: ["legal", "finance"],
    question: "How did the SEC's 2018 “funding secured” case against Elon Musk affect Tesla's stock price?",
    outcome: "Tesla's share move across the tweet, the charges, the settlement and the court's approval, each cited to the SEC and the court.",
  },
  {
    domains: ["legal"],
    question: "What is the latest status of United States v. Google LLC, the Justice Department's search antitrust case?",
    outcome: "A dated case timeline from the 2020 complaint through the 2024 ruling, the remedies judgment and both appeals.",
  },
  {
    domains: ["finance"],
    question: "Analyze the recent stock performance of Tesla and identify the major factors that influenced it.",
    outcome: "Six months of return, volatility and drawdown, with the moves around Tesla's own deliveries and results filings.",
  },
];

export default function LandingPage() {
  const state = useLoopingSample();
  const running = Object.values(state.agents).find((a) => a.status === "running");
  const phase = state.done ? "Report ready" : running?.detail ?? "Starting";
  const recent = state.logs.slice(-3);

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-surface/85 backdrop-blur-xl border-b border-outline-variant/20">
        <div className="max-w-[1200px] mx-auto h-16 px-6 flex items-center justify-between">
          <Link to="/" className={`flex items-center gap-2.5 rounded ${focus}`}>
            <BrandMark size={30} />
            <span className="font-headline-sm text-headline-sm tracking-tight">DeepSearch</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 font-body-md text-body-md text-on-surface-variant">
            <a href="#how" className={`hover:text-on-surface transition-colors rounded ${focus}`}>How it works</a>
            <a href="#domains" className={`hover:text-on-surface transition-colors rounded ${focus}`}>Domains</a>
            <a href="#examples" className={`hover:text-on-surface transition-colors rounded ${focus}`}>Examples</a>
            <a href="#limits" className={`hover:text-on-surface transition-colors rounded ${focus}`}>Limits</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/login" className={`px-3 py-2 rounded-lg font-body-md text-body-md text-on-surface-variant hover:text-on-surface transition-colors ${focus}`}>
              Sign in
            </Link>
            <Link to="/dashboard" className={`px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-medium font-body-md text-body-md hover:opacity-90 transition-opacity ${focus}`}>
              Open DeepSearch
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full bg-primary-container/10 blur-3xl pointer-events-none" />
        <div className="absolute top-40 right-0 w-[420px] h-[420px] rounded-full bg-tertiary-container/10 blur-3xl pointer-events-none" />
        <div className="relative max-w-[1200px] mx-auto px-6 pt-16 pb-16 lg:pt-24 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-5 flex flex-col gap-6"
          >
            <span className="font-label-code-sm text-label-code-sm text-primary tracking-wider">LEGAL + FINANCE · MULTI-AGENT RESEARCH</span>
            <h1 className="font-headline-xl text-5xl lg:text-6xl leading-[1.05] tracking-tight">
              Research that shows its work<span className="text-primary-container">.</span>
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-[44ch]">
              Ask a legal or financial question. A team of agents plans the work, gathers sources, checks every claim, and
              writes a report with citations.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link to="/research/new" className={`group flex items-center gap-2 px-5 py-3 rounded-lg bg-primary-container text-on-primary-container font-medium font-body-md text-body-md hover:opacity-90 transition-opacity ${focus}`}>
                Start a research <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <a href="#how" className={`px-5 py-3 rounded-lg border border-outline-variant/50 text-on-surface hover:bg-surface-container-high transition-colors font-body-md text-body-md ${focus}`}>
                See how it works
              </a>
            </div>
            <p className="font-body-sm text-body-sm text-outline max-w-[48ch]">
              Runs on free public sources: CourtListener court records, SEC EDGAR filings and Yahoo Finance prices. Without
              the backend it replays a fictional sample, and says so.
            </p>
          </motion.div>

          {/* The real execution graph, replaying the fictional sample on a loop */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="lg:col-span-7"
          >
            <div className="rounded-xl bg-surface-container-low border border-outline-variant/30 shadow-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 shrink-0 rounded-full ${state.done ? "bg-tertiary" : "bg-primary animate-pulse"}`} />
                  <span className="font-label-code-sm text-label-code-sm text-on-surface-variant truncate">{phase}</span>
                </div>
                <span className="font-label-code-sm text-label-code-sm text-outline shrink-0">Fictional sample run, replayed</span>
              </div>
              <div className="p-4">
                <AgentTopology agents={state.agents} />
              </div>
              <div className="px-4 py-3 border-t border-outline-variant/20 bg-surface-container-lowest/60 min-h-[92px] flex flex-col gap-1.5">
                {recent.length === 0 && <p className="font-body-sm text-body-sm text-outline">Waiting for the first event</p>}
                {recent.map((l) => (
                  <p key={l.id} className="font-body-sm text-body-sm text-on-surface-variant truncate">
                    <span className="text-primary">{l.agent === "system" ? "System" : AGENT_LABEL[l.agent]}</span>
                    <span className="text-outline"> · </span>
                    {l.message}
                  </p>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        <div className="relative max-w-[1200px] mx-auto px-6 pb-16">
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-xl overflow-hidden border border-outline-variant/30 bg-outline-variant/30">
            {PROOF.map((p) => (
              <div key={p.value} className="bg-surface-container-low p-5 flex flex-col gap-1">
                <dt className="font-headline-lg text-headline-lg text-on-surface">{p.value}</dt>
                <dd className="font-body-sm text-body-sm text-on-surface-variant">{p.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* How it works: a real sequence, so numbered */}
      <section id="how" className="scroll-mt-16 border-t border-outline-variant/20 bg-surface-container-lowest">
        <div className="max-w-[1200px] mx-auto px-6 py-20">
          <div className="max-w-[60ch] mb-12">
            <h2 className="font-headline-lg text-headline-lg lg:text-4xl lg:leading-tight">Planning is separate from doing</h2>
            <p className="mt-3 font-body-lg text-body-lg text-on-surface-variant">
              Language models plan, extract and write. Searching, fetching and arithmetic stay in ordinary code, so they are
              repeatable and free. A full run makes at most eight model calls.
            </p>
          </div>
          <ol className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {STEPS.map((s, i) => (
              <motion.li
                key={s.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="rounded-xl bg-surface-container-low border border-outline-variant/30 p-5 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <s.icon size={20} className="text-primary" />
                  <span className="font-label-code-sm text-label-code-sm text-outline tabular-nums">0{i + 1}</span>
                </div>
                <h3 className="font-headline-sm text-headline-sm">{s.title}</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{s.body}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Domains */}
      <section id="domains" className="scroll-mt-16 border-t border-outline-variant/20">
        <div className="max-w-[1200px] mx-auto px-6 py-20 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5 flex flex-col gap-4">
            <h2 className="font-headline-lg text-headline-lg lg:text-4xl lg:leading-tight">Two domains, one report</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-[46ch]">
              A question about a lawsuit and its effect on a stock uses both teams in parallel. They share one set of
              workers and one verification pass.
            </p>
          </div>
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DomainCard icon={Gavel} iconClass="text-secondary" title="Legal" items={LEGAL_SOURCES} note="Sources are ranked: court records outrank news." />
            <DomainCard icon={LineChart} iconClass="text-tertiary" title="Finance" items={FINANCE_SOURCES} note="Numbers come from code, never from the model." />
            <div className="sm:col-span-2 rounded-xl bg-surface-container-low border border-outline-variant/30 p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <BookOpenCheck size={18} className="text-primary" />
                <h3 className="font-headline-sm text-headline-sm">Claims keep their type</h3>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant max-w-[62ch]">
                An allegation is never written as a fact. Every finding in a report carries one of these labels, and only
                an official source or a computed figure can make something an established fact.
              </p>
              <div className="flex flex-wrap gap-2">
                {CLAIM_TYPES.map((c) => (
                  <span key={c} className={`font-body-sm text-body-sm rounded-full px-3 py-1 border ${CLAIM_TYPE_CLASS[c]}`}>
                    {CLAIM_TYPE_LABEL[c]}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Examples: the recorded demo scenarios */}
      <section id="examples" className="scroll-mt-16 border-t border-outline-variant/20 bg-surface-container-lowest">
        <div className="max-w-[1200px] mx-auto px-6 py-20">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div className="max-w-[60ch]">
              <h2 className="font-headline-lg text-headline-lg lg:text-4xl lg:leading-tight">Three real cases, ready to replay</h2>
              <p className="mt-3 font-body-lg text-body-lg text-on-surface-variant">
                Recorded runs with checked, dated sources and real price data. They replay through the same pipeline, and
                every figure is recomputed as you watch.
              </p>
            </div>
            <Link to="/dashboard" className={`shrink-0 flex items-center gap-2 font-body-md text-body-md text-primary hover:underline ${focus}`}>
              <PlayCircle size={16} /> Run them from the Dashboard
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {EXAMPLES.map((e) => {
              const chip = domainChip(e.domains.length === 2 ? null : e.domains[0]);
              return (
                <Link
                  key={e.question}
                  to="/dashboard"
                  className={`group rounded-xl bg-surface-container-low border border-outline-variant/30 hover:border-primary/50 p-5 flex flex-col gap-3 transition-colors ${focus}`}
                >
                  <span className={`self-start font-tag-caps text-tag-caps px-1.5 py-0.5 rounded border uppercase tracking-wider ${chip.className}`}>{chip.label}</span>
                  <p className="font-body-md text-body-md text-on-surface font-medium">{e.question}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant flex-1">{e.outcome}</p>
                  <span className="flex items-center justify-between font-label-code-sm text-label-code-sm text-outline">
                    Recorded demo · data as of 12 Oct 2026
                    <ArrowRight size={14} className="text-primary group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Limits */}
      <section id="limits" className="scroll-mt-16 border-t border-outline-variant/20">
        <div className="max-w-[1200px] mx-auto px-6 py-20 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5">
            <h2 className="font-headline-lg text-headline-lg lg:text-4xl lg:leading-tight">What to know before you rely on it</h2>
          </div>
          <div className="lg:col-span-7 flex flex-col divide-y divide-outline-variant/20">
            {[
              ["It is a college project.", "DeepSearch is an academic build of a multi-agent design. Treat its output as a starting point for your own checking."],
              ["It is not legal or financial advice.", "Reports summarise public sources. They do not replace a lawyer or a licensed advisor."],
              ["Recorded demos are dated.", "Each one shows the date its sources were gathered. Nothing in a demo is invented to look current."],
              ["Unverified stays unverified.", "When sources conflict or are missing, the report says so instead of picking a side."],
            ].map(([title, body]) => (
              <div key={title} className="py-5 first:pt-0">
                <h3 className="font-headline-sm text-headline-sm">{title}</h3>
                <p className="mt-1 font-body-md text-body-md text-on-surface-variant max-w-[60ch]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-outline-variant/20 bg-surface-container-lowest">
        <div className="max-w-[1200px] mx-auto px-6 py-20 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <h2 className="font-headline-lg text-headline-lg lg:text-4xl lg:leading-tight max-w-[22ch]">Watch a run from question to report</h2>
          <div className="flex items-center gap-3">
            <Link to="/research/new" className={`px-5 py-3 rounded-lg bg-primary-container text-on-primary-container font-medium font-body-md text-body-md hover:opacity-90 transition-opacity ${focus}`}>
              Start a research
            </Link>
            <Link to="/signup" className={`px-5 py-3 rounded-lg border border-outline-variant/50 hover:bg-surface-container-high transition-colors font-body-md text-body-md ${focus}`}>
              Create an account
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-outline-variant/20">
        <div className="max-w-[1200px] mx-auto px-6 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 font-body-sm text-body-sm text-outline">
          <span>DeepSearch, an academic project. Sign-in is a demo screen; research history stays on the computer running the backend.</span>
          <span>Not legal or financial advice.</span>
        </div>
      </footer>
    </div>
  );
}

function DomainCard({ icon: Icon, iconClass, title, items, note }: { icon: typeof Gavel; iconClass: string; title: string; items: string[]; note: string }) {
  return (
    <div className="rounded-xl bg-surface-container-low border border-outline-variant/30 p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Icon size={18} className={iconClass} />
        <h3 className="font-headline-sm text-headline-sm">{title}</h3>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((s) => (
          <li key={s} className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
            {s.includes("pandas") ? <Calculator size={13} className="text-outline shrink-0" /> : <Database size={13} className="text-outline shrink-0" />} {s}
          </li>
        ))}
      </ul>
      <p className="font-body-sm text-body-sm text-outline">{note}</p>
    </div>
  );
}
