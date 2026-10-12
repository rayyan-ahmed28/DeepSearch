# DeepSearch — Project Knowledge

This file is the single source of truth for the DeepSearch project: what is being built, why, how it is designed, which decisions were made and why, what exists today, and the practical knowledge needed to keep working on it. Anyone (or any AI assistant) starting cold should read this first.

This file lives in the repository at `docs/KNOWLEDGE.md` and is kept in step with the code; copies elsewhere (claude.ai project knowledge, Downloads) may lag. The older status page "DeepSearch — Full Project Plan & Status.html" is superseded. The companion files `DEEPSEARCH_PLAN.md` and `DEEPSEARCH_PHASES.md` were not carried over; section 14 holds the phase order.

**Last updated:** 2026-10-13 (Phase 9). The latest code checkpoint (`deepsearch_wip5.zip`) was imported into a git repository and this file was reconciled with it. Where an earlier version of this file described work that is not in the code, it has been corrected.

---

## 1. The project in one page

**DeepSearch** is a college project: an AI-powered, multi-agent research system for **domain-specific research**, limited in this MVP to two domains: **Legal** and **Finance**.

Subtitle: *Agentic AI-Driven Multi-Agent Framework for Domain-Specific Research.*

A normal chatbot answers a complex question in one model call. DeepSearch instead behaves like a small research consultancy:

1. Understands the question.
2. Decides which domain(s) apply (Legal, Finance, or both).
3. Writes a research plan.
4. Delegates tasks to shared worker agents (search, court records, financial data, calculations, charts).
5. Collects evidence from appropriate sources.
6. Runs calculations in deterministic code, never in the LLM.
7. Verifies claims against sources.
8. Produces a structured, citation-backed report with charts and a timeline.

**Flagship demonstration:** "How could a recent lawsuit against Company X affect its stock price?" This is both a legal and a financial question and exercises the whole architecture.

**It is a website** (React single-page app plus a FastAPI backend), not a native mobile or desktop app. It is built for desktop/laptop/tablet; primary targets 1440×900 and 1920×1080. It should not break on a phone browser but is not optimised for it.

**Who it is for:** a college evaluator (viva) and the student team. Priorities in order: functional MVP, premium UI, a clear demonstration of the multi-agent architecture, real research capability where possible, source verification, citations, charts, good animation, easy setup, **₹0 cost**.

---

## 2. Scope

**In scope:** Legal research, Finance research, combined Legal+Finance research; real-time progress UI; citations and verification; charts and timelines; Demo Mode with frozen real data; Live Mode with free-tier APIs.

**Jurisdiction (decision D22):** United States only. CourtListener, SEC EDGAR and the SEC/DOJ sources are US systems. yfinance can fetch Indian (.NS/.BO) prices, but there is no free Indian court-records source in the plan. Say this plainly if asked in the viva.

**Out of scope (deliberately):** Healthcare, Sports, Agriculture or any other domain (the architecture must make adding one easy, but none are built); real authentication or accounts; billing or subscriptions; Kubernetes or microservices; enterprise observability; production-scale databases; native mobile apps.

**Extensibility rule:** keep a `DomainManager` concept so a future manager (Healthcare, Sports, Agriculture) can be added without changing the Router, the graph wiring or the shared workers. Do not implement future domains now.

---

## 3. Core concept: the Dynamic Matrix Multi-Agent Architecture

The defining idea is that **planning is separated from execution.**

```
User query
   |
Gateway Router            LLM, 1 call: classify domain(s), complexity
   |
   +--> Legal Manager     LLM, 1 call: legal research plan        --+
   |                                                                |  run in parallel
   +--> Finance Manager   LLM, 1 call: financial research plan    --+  when both apply
                |
        Shared Workers    deterministic code (no LLM)
        - Web Research
        - Legal Records (CourtListener)
        - Financial Data (yfinance, SEC EDGAR)
        - Data Analysis (pandas/numpy)
        - Chart preparation
        - Document Research (optional)
                |
        Verification      LLM, 1 call: extract claims + link sources; rules set every status
                |
        Report Architect  LLM, 1 call: structured report
                |
        Final cited report
```

"Matrix" means domains (Legal, Finance) are rows and shared workers are columns: any manager can dispatch to any worker. The Web Research worker, for instance, is shared by both managers.

**AI where reasoning is needed, deterministic code where computation is enough.** Router, Managers, the claim-extraction step in Verification and the Report Architect use an LLM. Workers, calculations, chart data preparation and most of verification are plain Python. This is both a quality decision (numbers must never be invented) and a cost decision (free-tier quotas).

**LLM call budget (decision D9, revised by D19):** at most 8 LLM calls per run, 7 in practice: Router (1), Legal Manager (0 or 1), Finance Manager (0 or 1), GPT Researcher's internal sub-query generation (1 per web-research invocation, one invocation per active manager), Verification claim extraction (1), Report Architect (1). A single-domain run uses 5. Conflict summaries are written from the rule results by a template, not an LLM. Our own calls go through `LLMProvider`, which counts them. GPT Researcher uses its own LLM client, so the counter adds 1 per `conduct_research()` call and cross-checks with `get_costs()` afterwards: those calls can be observed, not blocked.

---

## 4. Agents and their responsibilities

### Gateway Router
Understands the query, determines relevant domain(s) with a primary and secondary ranking (a query can be Finance-primary with Legal-secondary or the reverse), estimates complexity, and routes. If the user picks a domain manually on the New Research screen (Legal, Finance, Legal+Finance), that **overrides** classification (decision D7); the Router still logs a `domain_classified` event so the activity feed stays consistent. Planned: a deterministic keyword fallback if the LLM is unavailable or returns invalid output.

### Legal Manager
Strategic brain for legal research. Understands the question, builds a legal research plan, chooses sources, breaks work into tasks for workers, and states what the report must establish: current legal status, the timeline, and which statements are allegations rather than established facts. Its one LLM call is the plan; evidence becomes typed claims in the Verification step (D19).

Source hierarchy, in order of preference:
1. Official court records
2. Government / regulatory sources
3. Official company filings and statements
4. Established, reputable news
5. Secondary analysis

Opinion blogs, social media and random sites are never treated as authoritative legal evidence.

### Finance Manager
Strategic brain for financial research. Identifies the company/security, builds a financial research plan, decides what data and news to retrieve, requests calculations and charts, interprets results, and coordinates with the Legal Manager when legal events are involved. **It never computes or invents numbers.** Its one LLM call is the plan; numbers are interpreted only by the Report Architect, from stored calculations.

### Shared Workers (all deterministic, none call an LLM)
- **Web Research Worker** (`workers/web_search.py`, live since Phase 5): one interface, three back ends chosen by configuration: GPT Researcher used narrowly when Gemini is configured (1 LLM call per query, counted), Tavily's REST API when `TAVILY_API_KEY` is set, otherwise keyless DuckDuckGo (the `ddgs` package; it rate-limits heavy use, so a free Tavily key is recommended). Every result is classified by domain (`workers/source_types.py`): court domains → official court, `.gov` → regulatory, an allowlist of outlets → reputable news, social media → rejected, everything else → secondary. Search excerpts are kept as short snippets (≤220 characters); dates come from the search engine when it has them.
- **Legal Records Worker** (`workers/court_records.py`, live since Phase 5): CourtListener v4 docket search, works without a token at a low rate limit. Magistrate, warrant and miscellaneous dockets (`-mj-`, `-sw-`, `-mc-`, …) are filtered out, since they otherwise crowd out the real cases, and duplicate entries are merged. The Legal Manager's court query is party names plus the subject (e.g. "United States Google LLC antitrust"), because a case name alone matches thousands of warrant dockets. If nothing is found it reports "no primary court record found" and does not invent a case.
- **Financial Data Worker:** `yfinance` for price history; SEC EDGAR (`workers/edgar.py`, live since Phase 5, needs `SEC_EDGAR_USER_AGENT` with the user's own contact address) for the company's 8-K, 10-Q and 10-K filings in the price period. Each results 8-K (item 2.02) becomes an event window, so finance questions get the share-price move around every results report without an LLM.
- **Data Analysis Worker:** pandas/numpy for percentage change, returns, event-window returns, volatility, optional index comparison. Every output is a `Calculation` with its method recorded.
- **Chart preparation:** turns calculations into Recharts-ready JSON (`ChartSpec`). No server-side images.
- **Document Research Worker (optional):** processes PDFs/filings. Likely cut if time is short.

### Source Verification
One LLM call reads the collected sources and extracts claims: the text, the claim type (allegation, company statement, ...), the ids of the sources that support it, and any date or figure (decision D19). Deterministic rules (section 7) then set every claim's verification status; the LLM never sets a status. Conflicts are summarised by a template from the rule results.

Live since Phase 6. With Gemini, the model reads every retrieved source's title, date and excerpt. Without a key, the rule-based stand-in states only what structured records show (D36): each computed figure (cited to the price data), each SEC filing and each court docket. It never reads news text. Verification makes no LLM call when a run retrieved nothing (D40). Dated milestones the extractor labels go on the case timeline, but only if the rules verified or corroborated them (D37).

### Content Architect / Report Architect
Takes verified findings and produces the structured report: sections adapted to the query, citations attached, charts and timeline included, facts clearly separated from analysis. It writes numbers as placeholders that code fills in (D20). Followed by a code-level audit of the output (every citation resolves; every number in the financial sections matches a stored calculation).

---

## 5. Orchestration: LangGraph

LangGraph orchestrates agents, state, conditional routing, parallel execution, and retries.

- Graph (`graph/build_graph.py`, full shape since Phase 4): router → legal_manager ∥ finance_manager → (waits for both) legal_records ∥ web_research ∥ financial_data → financial_data → data_analysis → (waits for all three) verification → report_architect.
- Every node runs on every run and does nothing when its domain is out of scope, so the two join points always fire exactly once (no double-triggered verification). In live runs, agents not built yet (Legal Manager, Legal Records, Web Research, live claim extraction) report "skipped: not built yet"; in recorded demo runs they replay what was recorded.
- **Technical detail that matters:** parallel branches that write to the same state lists need reducers, otherwise one branch overwrites the other's results. Implemented in `schemas.py`: `merge_by_id` (append; an item with the same id replaces the old one) for sources, claims, tasks, calculations and charts, and `operator.add` for plain lists. Nodes return only their new items. `tests/test_state_reducers.py` proves it with a real two-branch LangGraph graph.
- Each node emits events to an event bus; a WebSocket handler forwards them to the browser.
- Each worker is wrapped with bounded retries (2 attempts, short backoff). A failed worker never crashes the run (decision D12).
- LangGraph is `>=1.0,<2` (1.2 installed). An earlier version of this file said GPT Researcher needs `<0.3`; that was wrong. GPT Researcher 0.14.x needs `langchain>=1.0`, which needs LangGraph 1.x, and the `<0.3` pin made `requirements.txt` impossible to install.

---

## 6. Data contracts

### Shared research state (`backend/app/models/schemas.py`, Pydantic v2, implemented and tested)
- Enums: `SourceType` (official_court, regulatory, company, reputable_news, secondary), `VerificationStatus` (verified, corroborated, unverified, conflicting), `ClaimType` (established_fact, allegation, party_claim, company_statement, regulatory_statement, news_report, analysis), `Domain` (legal, finance), `ResearchDepth` (quick, standard, deep), `TaskStatus`, `ExecutionStatus`.
- Models: `Source`, `Claim`, `Task`, `FinancialDataPoint`, `Calculation`, `ChartSpec` (`type`: line | bar | timeline, `data`: Recharts-ready records), `TimelineEvent`, `ResearchState`, `ResearchRequest` (`query`, `mode`: auto | legal | finance | legal_finance, `depth`), `WSEvent`.
- Added 2026-10-12: `Source.snippet` (evidence excerpt for the citation panel; `published_date` is often unknown for web pages and the UI must say "date unknown"), `Claim.event_date` / `value` / `unit` (structured parts, so code can detect conflicting dates and figures), `FinancialDataPoint.ticker` and `split_adjusted`, `WSEvent.seq`, and the list reducers described in section 5. Phase 1 added `Claim.domain` (`legal`, `finance`, or `None` for cross-domain) and the `timeline_ready` event.
- `ResearchState` fields: research_id, user_query, depth, mode_override, detected_domains, primary_domain, research_plan, tasks, sources, evidence, claims, financial_data, calculations, charts, timeline, citations, report, execution_status, demo_mode, errors, created_at. Nodes append to lists rather than overwrite them.
- Timestamps are timezone-aware UTC.

### WebSocket event contract (`WSEvent.type`)
Every message is `{type, payload, timestamp, seq}`. Types: `domain_classified` (domains, rationale), `plan_created` (manager, tasks), `agent_status` (agent, status: idle | running | done | skipped | error, detail), `activity_log` (agent, message, level, llm_call), `source_found` (a `Source`), `claim_verified` (a `Claim`, status in `verification`), `chart_ready` (a `ChartSpec`), `calculation_ready` (a `Calculation`, with `unit`), `timeline_ready` (events: `TimelineEvent[]`), `report_ready` (research_id), `error` (message). The TypeScript mirror of these shapes is `frontend/src/lib/executionEvents.ts`; the sample replay emits exactly them, so the real socket is a drop-in replacement. One frontend difference: `Source.url` is optional there, because sample data has no real link and must not invent one.

**Late connections:** the browser can only open `WS /ws/research/{id}` after `POST /api/research` has returned, so early events would be lost. The per-run event bus keeps the run's event history and replays it when a socket connects; the client uses `seq` to skip events it already has.

### REST and WebSocket API
Implemented (Phase 2): `POST /api/research` (`{query (1-2000 chars), mode, depth, scenario_id?}` → `{research_id, llm_provider, demo_mode, scenario}`), `GET /api/research/{id}` (since Phase 7, the run's history entry plus `errors`), `GET /api/research/{id}/report` (409 until ready), `GET /api/health` (mode, LLM provider, booleans for which providers are configured, never key values), `WS /ws/research/{id}?after=<seq>` (backlog then live; unknown id → an `error` event and close code 4404). Interactive docs at `http://localhost:8000/docs`.
Added in Phase 4: `GET /api/demo/scenarios`. Added in Phase 7 (D41–D43): `GET /api/research?saved=&limit=` (history, newest first), `PATCH /api/research/{id}` `{saved}` (409 unless the run completed), `DELETE /api/research/{id}` (204; 409 while running). A history entry has `research_id, query, mode, depth, status (running | completed | failed | interrupted), created_at, finished_at, llm_provider, demo_mode, scenario, title, domains, source_count, claim_count, saved`. Every run endpoint and the WebSocket also work for runs that are only in the database: their saved events replay, then the socket closes.

### Report contract (done, Phase 3)
`Report` in `schemas.py` (TypeScript mirror: `frontend/src/lib/report.ts`) is self-contained: research_id, title, query, generated_at, domains, demo_mode, llm_provider, ordered `sections`, plus the `sources`, `claims`, `calculations`, `charts` and `timeline` it refers to, and an `audit`. It travels in the `report_ready` event and is also served by `GET /api/research/{id}/report`.
- **Sections** have a `kind` (`SectionKind`, whose order is the display order): executive_summary, key_findings, case_overview, legal_developments, financial_impact, market_reaction, data_analysis, timeline, risk_factors, limitations, sources, disclaimer.
- **Blocks** (discriminated on `type`): paragraph (text + citations), bullets, finding (a claim id), chart (a chart id), calculations (a table of calculation ids with methods), timeline, sources, callout. Each citation is a `Source` id.
- **Who writes what:** the Report Architect's one LLM call returns a `ReportDraft` with narrative sections only (`DraftParagraph` = text + source_ids). `utils/report_builder.py` then fills `{{calc:<id>}}` placeholders (D20), keeps only citations that resolve to a retrieved source, drops narrative sections that don't fit the run's domains (a finance-only report never has a Case overview), and adds the deterministic sections: key findings, data analysis, timeline, limitations, sources and disclaimer.
- **Audit** (`ReportAudit`): figures_filled, figures_unresolved, free_numbers, citations_resolved, citations_removed, sections_dropped, and a computed `clean`. The Report screen shows it as "Report integrity".
- Sample runs build their report from the replayed events with the same rules (`assembleReport` in `lib/report.ts`), so the integrity panel is real for them too.

### Research depth (decision D8)
| Depth | Sources per manager | Verification passes | Index comparison (finance) |
|---|---|---|---|
| Quick | 3 to 5 | 0 (heuristic only) | No |
| Standard (default) | 6 to 10 | 1 | Optional |
| Deep | 10 to 15 | 2 (cross-check plus conflict scan) | Yes |

---

## 7. Guardrails (non-negotiable)

### Legal
- Prefer authoritative sources in the hierarchy above.
- Clearly label allegations; never present an allegation, party claim or company statement as established fact. Attribute every claim ("According to the plaintiff's filing...", "The company stated...").
- Always include dates; prefer the latest official information; flag conflicting information instead of silently choosing.
- Distinguish legal facts from AI analysis.
- The product provides research and information, **not legal advice**.

### Finance
- Never invent stock prices or financial metrics. Every number comes from a fetched data point or a recorded `Calculation`.
- Numerical analysis is done by deterministic Python (pandas/numpy), never by the LLM.
- Separate historical data (fact) from AI interpretation (analysis). Label assumptions. Cite underlying data sources.
- Present market-impact reasoning as possibility, never as certainty or investment advice.

### Verification rules (implemented in `workers/verification.py`, Phase 4)
The rules run in code on every claim; the LLM only extracts claims (D19) and can never set a status. Tested in `tests/test_verification_rules.py`.
- A claim with no source stays unverified.
- An allegation or party claim can never be upgraded to established fact unless an official court or regulatory source states the finding.
- A claim backed by an official court or regulatory source is verified (a company statement is verified by the company's own filing or release).
- A figure computed in code from the cited data (a claim with a `calculation_id`) is verified against that data (D31).
- Two or more independent source domains agreeing makes a claim corroborated (the same outlet twice is not independent).
- Contradictory dates or figures across sources make a claim conflicting; show both. In code: claims about the same fact share a `subject` key, and a subject whose claims disagree on date or figure marks all of them conflicting.
- Guardrail in code: an "established fact" without an official, regulatory or calculation source is relabelled (company statement, news report, or analysis when unsourced).
- **Number audit:** every number in the Financial Impact, Market Reaction and Data Analysis sections must come from a stored calculation or data point. With D20's placeholders this holds by construction; the audit checks that every placeholder resolves and flags any other number in the narrative (dates such as "10 April 2026" or "2026-04-10" and four-digit years are allowed). Citation ids that do not resolve are stripped and counted.

### Citations
Every load-bearing factual claim carries a citation. Clicking a citation opens a source panel: source, source type (Official / Regulatory / Company / Reputable News / Secondary), publication date, URL, verification status (Verified / Corroborated / Unverified / Conflicting), and the evidence snippet. **Never fabricate a citation or a URL.** A claim that cannot be backed by a real retrieved source is labelled analysis or unverified, not cited.

### Content and honesty rules (apply to UI copy and demo data)
- No claims the project cannot back up: no "SOC2", "zero hallucination", "air-gapped", "end-to-end encrypted", "zero-knowledge", "cryptographically verified" and the like.
- No real companies or real pending cases dressed with invented figures, quotes or docket numbers. Mock content uses fictional companies and is labelled illustrative.
- Anything simulated is labelled ("SIMULATED RUN · DEMO MODE").
- Do not expose raw chain-of-thought. Show high-level status only ("Finance Manager is retrieving historical market data").

---

## 8. Decision log

| # | Decision | Reason |
|---|---|---|
| D1 | Gemini (Flash-class, free tier) as default LLM behind a provider interface (`LLMProvider`: Gemini, Fake for tests/demo, OpenAI stub) | Free, no card, swappable without rewriting agents |
| D2 | Tavily (free credits) as primary web search, keyless DuckDuckGo as fallback; both return the same normalised result shape | Free-first; app works with zero signups |
| D3 | `yfinance` for prices, SEC EDGAR for filings | Free; EDGAR is official; yfinance is unofficial and can break, so wrap defensively and degrade to Demo data |
| D4 | CourtListener API v4 for court records; supplement with news; label non-primary sources honestly | Free; students can get a free EDU membership for higher limits |
| D5 | SQLite via SQLAlchemy for history and saved reports; anonymous browser `session_id` in localStorage sent as a header; no login system | Satisfies History/Saved Reports without building auth |
| D6 | Charts: pandas computes data, frontend renders with Recharts; no matplotlib images | Interactive, themed, already in stack |
| D7 | Manual domain choice overrides Router classification; Router still logs the event | Consistent activity feed |
| D8 | Depth table in section 6 | Makes Quick/Standard/Deep operational |
| D9 | At most 8 LLM calls per run (7 in practice, see section 3); our calls counted, GPT Researcher's observed | Free-tier quotas |
| D10 | Demo Mode replays real, frozen, dated snapshots through the same graph and event stream as Live Mode; badge "Demo Mode, data as of [date]" | Reliable viva demo; architecturally honest |
| D11 | Deployment is optional: Vercel/Netlify frontend, Render backend. Running locally for the viva is sufficient | Free; Render free tier sleeps |
| D12 | One failed worker never crashes the run: each returns a `WorkerResult` (success, partial, failed); the report states gaps rather than hiding or inventing them | Resilience and honesty |
| D13 | Use GPT Researcher as a narrow pip dependency (option A), not vendored, not the whole framework | Saves building a debugged retriever/scraper/compression pipeline (see section 10) |
| D14 | Build the frontend first, from Stitch designs, on mock data; wire the backend afterwards | Lets the design be approved and demoable early |
| D15 | Claude builds the project directly (originally planned as a prompt for OpenAI Codex) | Change of plan by the user |
| D16 | Adopt Stitch's Material Design 3 token names and values verbatim in `tailwind.config.ts` | 1:1 fidelity with approved screens, low rebuild risk |
| D17 | Icons: port Stitch's Google Material Symbols to `lucide-react` | Matches the intended stack |
| D18 | Self-host fonts with `@fontsource` (Inter, Space Grotesk, IBM Plex Mono) instead of Google Fonts links | App looks identical offline; demo-day network may be unreliable (implemented 2026-10-12; it was not in wip5) |
| D19 | Claim extraction is Verification's one LLM call; deterministic rules set every status; the conflict summary is a template | The pipeline had no step that turned sources into claims, and one extra call per manager would break the budget. Keeps the topology and the budget |
| D20 | Report numbers are placeholders (`{{calc:<id>}}`) filled by code | The number audit holds by construction instead of regex-matching prose, which would flag every year and date |
| D21 | Demo Mode replays a recorded live run: worker results and every LLM response, keyed by node. A non-demo query with no keys gets a clear "Live Mode needs API keys" message and the option to open the nearest demo scenario | "Same graph, blank keys" is only possible if LLM outputs are recorded too |
| D22 | Scope is US jurisdiction | All legal and filing sources are US systems |
| D23 | Develop natively on Windows: venv at `%USERPROFILE%\.venvs\deepsearch`, `pydantic<2.14`, exact versions in `requirements-lock.txt` | Smart App Control blocks pydantic-core 2.50; long paths break Windows' 260-character limit; WSL's Python lacks pip without sudo (section 16) |
| D25 | The frontend uses the backend when `/api/health` answers, otherwise the sample replay; every screen says which ("Backend run · …" or "Demo replay of sample events (Backend not running)") | The app always works, and never passes a replay off as a live run |
| D26 | If Gemini fails (quota, outage, bad JSON), the call falls back to the rule-based stand-in for that step; the failed call still counts against the budget and the activity feed says so | One failed call never kills a run (D12), and the fallback is visible |
| D28 | Export = Markdown download plus browser print-to-PDF (print styles switch to black on white) | Closes the export open item at ₹0 with no server-side PDF library |
| D29 | The Finance Manager uses the time frame the question names ("last year", "three months"); the depth setting is only the default | A question about "the last year" must not get six months of data |
| D33 | Court searches filter procedural dockets and use "parties + subject" queries | Live tests showed a case name alone returned only warrant and miscellaneous dockets; with the filter and subject the main case and its appeals come first |
| D34 | Keyless web search uses `ddgs`, the maintained successor of `duckduckgo_search` | The old package was rate-limited and deprecated; `ddgs` returned results in live tests |
| D35 | Results 8-K filings from EDGAR become event windows automatically | Gives finance questions dated drivers without spending LLM calls |
| D36 | Without Gemini, live claims come only from structured records (computed figures, SEC filings, court dockets) | A rule cannot read news honestly; these records state facts outright, so the stand-in still produces checkable findings |
| D37 | The live case timeline holds only dated claims that the extractor labelled as milestones and the rules verified or corroborated; the stand-in labels only dockets whose parties match the case the question names | A docket search also returns unrelated cases (e.g. Richards v. Google), which must not appear on the named case's timeline |
| D38 | Gemini gets the Pydantic schema as a JSON schema with every `$ref` inlined (`response_json_schema`). The reply is validated by Pydantic, with one retry on HTTP 429/500/503 and a 90 s timeout. A failed step falls back to the stand-in, and the report lists it under limitations | The API accepts only a subset of JSON Schema; a quota error must not end a run, and the reader must know which steps the model did not write |
| D39 | `GEMINI_API_KEY` alone also configures GPT Researcher (its blank `GOOGLE_API_KEY`, `FAST/SMART/STRATEGIC_LLM`, `EMBEDDING`, `RETRIEVER` are filled from our settings; values the user set are kept) | Its packaged default is an xAI model, which would fail silently |
| D40 | Verification spends no LLM call when a run retrieved no sources and computed nothing | Nothing to extract; keeps the budget for runs that need it |
| D41 | History uses Python's built-in `sqlite3` (one `runs` table, `app/db/store.py`), not SQLAlchemy, with no browser session id. This replaces D5's mechanism | One local user and one table: plain SQL is shorter and easier to explain in the viva; a session id only matters with several users |
| D42 | A run's full event history and final state are saved when it finishes; reopening replays the saved events through the same WebSocket | Every screen (Execution, Workspace, Report) rebuilds exactly as it was, with no second code path |
| D43 | A row is written when a run starts; at start-up, rows still marked running become "interrupted" and reopen with a "server stopped" error | A restart mid-run is reported, never silently lost |
| D44 | The database file is `backend/deepsearch.db` (`DATABASE_URL`, relative paths resolve against `backend/`); tests use an in-memory database | The same file whichever folder the server is started from; it is git-ignored |
| D45 | Light theme and accent colours, via CSS-variable tokens; dark stays the default and keeps the exact Stitch values. This replaces "dark only" | The user asked for light/dark; variables let one class list serve both themes with no per-component changes |
| D46 | Settings hold only options that do something: appearance, research defaults, run-finished behaviour, browser data, and real diagnostics from `/api/health`. The mockup's fake registries, SOC2/HIPAA claims, build signatures, "Flush Cache" and "Export Audit Log" are gone | Content-integrity rules: no control or claim without a real feature behind it |
| D47 | Settings are per browser (`localStorage`, `store/settingsStore.ts`); `index.html` applies the saved appearance before first paint | No accounts (D5); and no flash of the dark theme when light is saved |
| D48 | The mode badge reads `/api/health`: "Sample mode" (backend off), "Live data · rule-based", or "Live · Gemini" | Replaces the static "DEMO MODE" chip, which was wrong whenever the backend was running |
| D49 | Below 1024 px the sidebar is a slide-in drawer (☰ in the top bar; closes on navigation, Escape or the backdrop); pages use `px-4 sm:px-8` | The app must not break on a phone or tablet (section 1); checked with an overflow sweep of every screen at 375, 820 and 1280 px |
| D50 | A real Stop: `POST /api/research/{id}/stop` cancels the run task, running agents become "Stopped by you", the run keeps what it found and is saved with status `stopped` | The plan said pause/abort exists or is removed; a cancel is honest and cheap, a pause is not |
| D51 | Error boundaries around every page (`AppShell` and the root) and around the agent graph, charts, timeline and report body; unknown routes get a Not Found page | One failing component must never blank the app |
| D52 | Frontend tests use Vitest on the pure logic (stream reducer, report export and citations, formatting); no Playwright | Playwright's browser download is likely to be blocked by Smart App Control on this machine; the browser checks are done through the app's preview pane |
| D30 | The full graph shape and the deterministic verification rules were built in Phase 4 (pulled forward from Phases 5–6) | A recorded run must replay through the real pipeline, and statuses must be computed at replay time rather than copied from a file |
| D31 | A figure computed in code from the cited price data counts as verified | It is checked against its data by construction; "corroborated" would wrongly imply two agreeing sources |
| D32 | Recorded scenarios never fall back to the fictional sample: if the backend is down, the Dashboard says so and how to start it | A replay must never be mistaken for real recorded research |
| D27 | Until recorded scenarios exist (Phase 4), backend Demo Mode = rule-based stand-in for the LLM + live Yahoo prices (yfinance needs no key) | Runs real data with zero keys; recorded runs (D21) arrive with the demo scenarios |
| D24 | Gemini models: `gemini-3.5-flash-lite` by default (`gemini-3.8-flash` if the free tier allows), embeddings `gemini-embedding-001` | `gemini-2.0-flash` shut down 2026-06-01 and `text-embedding-004` on 2026-01-14; Google recommends 3.5 Flash-Lite or 3.8 Flash for new projects |

---

## 9. Technology stack and external services

**Frontend:** React 18, Vite 5, TypeScript (strict), Tailwind 3, Framer Motion, Recharts, lucide-react, React Router 6, Zustand, TanStack Query, `@fontsource/*`.
**Backend:** Python 3.12, FastAPI, LangGraph 1.x, Pydantic v2 (`<2.14`, see D23), SQLAlchemy and SQLite, WebSockets, pandas/numpy, `google-genai`, `gpt-researcher` 0.14.x plus `langchain-google-genai`, `yfinance`, `requests`, pytest, httpx.

**Free-tier facts (verify current numbers at implementation time; they change without notice):**
- **Gemini API:** free tier, Flash-class models only (Pro is paid-only since April 2026), no credit card. Google's docs no longer publish free-tier numbers: limits are per project and shown in AI Studio. Third-party reports from 2026 disagree widely (from about 20 to 1,500 requests per day for Flash), so plan for the low end. At ~7 calls per run that may mean only a few live runs per day; record the demo runs early.
- **Tavily:** free tier of about 1,000 credits per month, no card required. A basic search is about 1 credit.
- **CourtListener API:** free with a registered token. Free-tier rate limits are modest (a handful of requests per minute and on the order of 100 per day, tightened in 2026); a free EDU membership with a college email raises them.
- **SEC EDGAR:** no key; a descriptive `User-Agent` header is required by SEC policy; fair-use rate limit around 10 requests per second.
- **yfinance:** free, no key, unofficial scraper of Yahoo Finance.
- **Stitch (Google Labs):** free design tool used for the UI; exports React/Tailwind or HTML/CSS, Figma, and a `DESIGN.md`.

**Environment variables (`backend/.env.example`):** `LLM_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL` (our own agents' model, default `gemini-3.5-flash-lite`), `FAST_LLM`/`SMART_LLM`/`STRATEGIC_LLM` (GPT Researcher's own model settings, for example `google_genai:gemini-3.5-flash-lite`), `GOOGLE_API_KEY` (same value as the Gemini key), `EMBEDDING` (`google_genai:models/gemini-embedding-001`, avoids a torch install), `TAVILY_API_KEY`, `COURTLISTENER_API_TOKEN`, `SEC_EDGAR_USER_AGENT`, `DEMO_MODE` (auto | true | false; auto means live only when keys exist), `DATABASE_URL`, `CORS_ORIGINS`. **The app must run completely with every key blank, in Demo Mode.** Keys must never be committed.

---

## 10. GPT Researcher: audit findings

GPT Researcher (`assafelovic/gpt-researcher`, version 0.14.7 audited, a general-purpose open-source deep-research agent) was audited as a possible backbone for the Web Research Worker. It is **not** DeepSearch: it has no Legal/Finance domain logic, no source-type taxonomy, no verification states, no financial or legal data workers, and its frontends are generic. Conclusion: use it as a pip dependency, narrowly.

**Use only:** the `GPTResearcher` class constructed with `report_source="web"`, a pre-supplied `agent` and `role`, optionally `query_domains`; call only `await conduct_research()`; read results with `get_research_sources()`, `get_source_urls()`, `get_costs()`.

**Why this is cheap:**
- If `agent` and `role` are supplied, its own LLM-based role selection (`choose_agent`) is skipped. That leaves one LLM call per invocation: sub-query generation (`strategic_llm`, falling back to `smart_llm`).
- `MAX_ITERATIONS` defaults to 3, so about 4 searches per invocation (the original query plus up to 3 sub-queries).
- Content compression is embedding-based, not chat-LLM-based, and has a fast path that skips compression for small result sets.
- It is async, keeps no global state, and takes any object with an async `send_json` method as its "websocket"; progress messages arrive as `{type, content, output, metadata}`, so a small adapter translates them into our `activity_log` events.

**Do not import or copy:** `multi_agents/` (its own LangGraph pipeline), `backend/server/` (its own FastAPI app, WebSocket manager, report store), both of its frontends, `ReportGenerator`/`write_report()` and the export stack, `DeepResearchSkill` (`report_type="deep"` multiplies calls), `ImageGenerator`, `mcp/` and `mcp-server/`, the `document/` loaders, `evals/`, Docker/Terraform/CI scaffolding.

**Gotchas:**
- `document/document.py` imports `Unstructured*Loader` classes at module level, so `unstructured` is installed and imported even for web-only use. Accepted as an install-time cost.
- Its default `EMBEDDING` is a local HuggingFace model but `sentence-transformers`/`torch` are not in its requirements, so the default would fail the first time the embedding path runs. Override `EMBEDDING` to a Gemini embedding.
- Its packaged default LLM is `xai:grok-4.3`. If our env vars do not point it at Gemini it silently tries to use xAI and fails.
- Its sources are `{url, title, raw_content, image_urls}`: no publication date, no source type. Our own classifier must add them. Dates usually cannot be recovered from `raw_content` (plain text, no HTML meta tags); Tavily returns `published_date` only for `topic="news"` searches. Expect many sources to show "date unknown".
- Its Gemini adapter (`langchain-google-genai`) is only an optional extra, so our `requirements.txt` lists it; without it every `google_genai:` model string fails at import.
- 0.14.x pins `numpy<2.3`, which has no wheels for Python 3.14, so use Python 3.12. Held to `<0.15` so the audited API does not move (0.16 exists).
- `google_genai` and `litellm` are both supported provider strings; `litellm` is a core dependency.
- This creates two provider abstractions side by side (ours for Router/Managers/Report Architect, its own for its one internal call). Not a functional conflict; document it.
- License: `pyproject.toml` says MIT, the repo's LICENSE text is an Apache-2.0 header. Either is permissive. Credit it in the README.
- Fallback if it ever causes real install pain: about 150 lines of hand-written Tavily plus DuckDuckGo wrapper.

---

## 11. Demo Mode and Live Mode

**Live Mode** uses the real free-tier services. **Demo Mode** replays real, frozen, dated data so the application can still show the full workflow if an API is down or a quota is exhausted. Demo Mode must still show Router, Managers, Workers, research activity, verification, charts and the final report, through the same pipeline and event stream as Live Mode. The UI shows a Demo badge with the snapshot date.

**The three recorded scenarios (done, Phase 4; data as of 12 October 2026)** live in `backend/app/demo/scenarios/*.json`:
1. **Legal + Finance (flagship), `sec_v_musk_2018`:** "How did the SEC's 2018 'funding secured' case against Elon Musk affect Tesla's stock price?" Sources (all opened and checked): SEC press releases 2018-219 (charges) and 2018-226 (settlement), SEC Litigation Release 24413 (confirms the 16 October 2018 Final Judgment), the SEC complaint (Doc. 1, No. 1:18-cv-8865, S.D.N.Y.), TechCrunch (27 Sep, 1 Oct, 16 Oct 2018) and Fortune (28 Sep, 1 Oct 2018). Price snapshot: TSLA 2 July to 31 October 2018. Event windows: the tweet (+8.3%), the SEC charges (−14.5%), the settlement (+17.4%), the court's approval (+4.7%). Split check: the snapshot's closes × 15 reproduce the $307.52 and $264.77 quoted in 2018 news exactly. Dropped: CNBC (blocks access), a CNN Money article (404).
2. **Legal, `us_v_google_search`:** "What is the latest status of United States v. Google LLC, the Justice Department's search antitrust case?" Pinned to *United States v. Google LLC*, No. 1:20-cv-03010 (D.D.C.). Sources: CourtListener docket entries 1033 (liability opinion, 5 Aug 2024), 1462 (Final Judgment, 5 Dec 2025), 1472 (Google's notice of appeal, 16 Jan 2026), 1485 (United States' notice of appeal, 3 Feb 2026), 1552 (second compliance status report, 17 Sep 2026); DOJ releases (20 Oct 2020, 5 Aug 2024, 2 Sep 2025); Alphabet's 10-Q for Q2 2026 (filed 22 Jul 2026); TechCrunch (5 Aug 2024, 2 Sep 2025). Status as of the recording: on appeal at the D.C. Circuit, with the district court supervising compliance. Dropped: Courthouse News (bot challenge, not bypassed), Law360 (paywall), Android Central (unreadable).
3. **Finance, `tesla_recent_performance`:** "Analyze the recent stock performance of Tesla and identify the major factors that influenced it." Price snapshot: TSLA 13 April to 12 October 2026. Sources: Tesla's own 8-K filings (Q2 deliveries 2 Jul, Q2 results 22 Jul, Q3 deliveries 2 Oct 2026) and Electrek (22 Jul, 2 Oct 2026). Event windows: Q2 deliveries (−1.3%), Q2 results (−15.6%), Q3 deliveries (+7.0%). Dropped: CNBC and Forbes (block access).

**How a recording replays (D21):** `RecordedLLMProvider` answers each LLM call with the recorded response, and `SnapshotPriceSource` serves the price snapshot (source id `src_prices`). Everything else runs live in the real graph: Data Analysis recomputes every figure from the snapshot, the Verification rules recompute every status, and the report builder re-audits the report. Recorded runs replay at a watchable pace (`DEMO_PACE_SECONDS`, default 0.8 s per step; 0 in tests). API: `GET /api/demo/scenarios`, and `POST /api/research` with `scenario_id`.

**Demo data rules:** prices come from `backend/scripts/snapshot_prices.py <scenario_id> <TICKER> <start> <end>` (run locally; this machine reaches Yahoo Finance). Legal and news facts are gathered by research and every URL is opened before use; anything unverifiable is dropped. Snippets are verbatim only for public-domain government and court records (and short company-filing sentences); news sources carry no snippet. LLM narratives contain no typed numbers: figures are placeholders, and amounts stated by sources (e.g. a penalty) appear only in sourced findings. `tests/test_scenarios.py` rejects any scenario whose citations don't resolve, whose sources come from a worker that won't run for its domains, whose snapshot doesn't cover an event window, or whose narrative types its own numbers, and replays each one through the graph checking the audit and the expected statuses.

---

## 12. Frontend knowledge

### Design system
Premium "AI research command center", dark by default, with a light theme and accent colours since Phase 8 (D45). It must not look like a chatbot or a generic ChatGPT clone. Avoid neon glassmorphism, cartoon AI graphics, giant gradients, stock photos, playful colours. Animations communicate state, they do not decorate.

Tokens come from the approved Stitch export. Since Phase 8 the colour values live in `frontend/src/styles/theme.css` as CSS variables (`--c-<role>: R G B`), with a dark block (the Stitch values below, unchanged), a light block (Material 3 light counterparts) and four accent families (indigo default, rose, amber, orchid) that recolour only the primary roles. `tailwind.config.ts` maps every role to `rgb(var(--c-role) / <alpha-value>)`, so `bg-primary/10` still works; SVG and Recharts colours use `rgb(var(--c-role))`. `warning` is now a token (dark #f5b942, light #8f5b00). Dark values:

| Token | Value | Use |
|---|---|---|
| surface / background | #121318 | page background |
| surface-container-lowest | #0d0e13 | sidebar, deepest wells |
| surface-container-low / surface-container | #1a1b21 / #1e1f25 | cards |
| surface-container-high / highest | #292a2f / #34343a | hover and raised |
| primary | #c4c0ff | light lavender accent text |
| primary-container | #8781ff | solid accent (buttons, running glow) |
| on-primary / on-primary-container | #2000a4 / #1b0091 | text on those |
| secondary | #7bd0ff | Legal accent (light blue) |
| tertiary / tertiary-container | #6bd8cb / #29a195 | Finance accent and success/completed (teal) |
| error / error-container | #ffb4ab / #93000a | failed/error |
| outline / outline-variant | #918fa1 / #464555 | muted text, hairline borders |
| on-surface / on-surface-variant | #e3e1e9 / #c7c4d8 | primary and secondary text |
| warning (not a token) | #f5b942 | retrying and rate-limit states, used as an arbitrary value |

Typography (bundled via `@fontsource`, with system fallbacks so a missing font never drops to serif): **Space Grotesk** for headlines, **Inter** for body and UI, **IBM Plex Mono** for data labels (timestamps, tickers, citation numbers, tags). Scale tokens: `headline-xl` 2.25rem, `headline-lg` 1.5rem, `headline-md` 1.25rem, `headline-sm` 1rem, `body-lg` 1rem, `body-md` 0.875rem, `body-sm` 0.75rem, `label-code-md` 0.8125rem, `label-code-sm` 0.6875rem, `tag-caps` 0.625rem. Radii: DEFAULT 0.25rem, lg 0.5rem, xl 0.75rem, full. Spacing tokens include `space-xs..xl`, `gutter`, `gutter-desktop`, `margin`, `margin-desktop`. Domain colouring: Legal = secondary (blue), Finance = tertiary (teal), shared/neutral = primary (indigo). Icon style: thin-line lucide icons.

### The Stitch export
The Stitch project export (zip) contains one folder per screen with `code.html` and `screen.png`, plus a `DESIGN.md` folder (`autonomous_intelligence_terminal`). Mapping:

| Screen | Stitch folder |
|---|---|
| Landing | `deepsearch_autonomous_ai_research_command_center` |
| Dashboard | `deepsearch_autonomous_research_dashboard` |
| New Research | `deepsearch_new_research_query` |
| Research Execution | `deepsearch_research_execution_agent_topology` |
| Research Workspace | `deepsearch_active_research_workspace` |
| Final Report | `deepsearch_final_research_dossier_intelligence_report` |
| Settings | `deepsearch_system_settings_enclave_configuration` |
| Login | `deepsearch_terminal_authentication_2` ("Welcome back") |
| Sign Up | `deepsearch_terminal_registration` |
| Brand logo | `deepsearch_brand_logo` (crosshair mark, ported as inline SVG `BrandMark`) |

`deepsearch_terminal_authentication_1` is an unused draft and is ignored. Several `screen.png` files in the first export were broken placeholders; the user re-supplied screenshots. Stitch used Tailwind via CDN with an inline Material Design 3 config and Google Material Symbols icons; both were replaced by a real Tailwind build and lucide-react. Stitch's inline `navigateToScreen(...)` handlers are replaced by React Router.

### Routes
`/` Landing, `/login`, `/signup`, `/dashboard`, `/research/new`, `/history` (Research History; `?view=saved` is Saved Reports, Phase 7), `/research/:id` (Execution), `/research/:id/workspace`, `/research/:id/report`, `/settings`, anything else redirects to `/`. `/` is the Landing page (Phase 8). Intended navigation: Landing to Sign Up or Login; Login, Sign Up and "Continue as guest (Demo Mode)" to Dashboard; Dashboard input or suggestion to Execution; completed recent research to Workspace (to Report once it exists); New Research "Start Research" to Execution; Execution to Workspace and (when complete) Final Report; Workspace to Final Report. Auth is UI-only: forms just navigate to the Dashboard.

### Architecture and conventions
- `@/` alias maps to `src/`; it must be configured in both `tsconfig.json` (paths) and `vite.config.ts` (`resolve.alias`), and `@types/node` is needed for `vite.config.ts`.
- Shared layout: `AppShell` = fixed `Sidebar` (w-60) + fixed `TopBar` + content. Used by Dashboard, New Research, Execution, Workspace, Report, Settings. Login, Sign Up and Landing do not use it.
- Tailwind class names must be complete static strings (no string building), or the build will not see them.
- Reusable: `BrandMark`, `AgentNetworkVignette`, `ToggleSwitch`.
- A `RunConfig` `{query, mode, depth}` (`lib/runConfig.ts`; `mode` uses the backend's values auto | legal | finance | legal_finance) travels to the Execution screen through React Router state. Suggested queries carry their own mode. Every run currently uses the id `demo-1`; real ids come with the run store (Phase 1).
- Browser storage (`localStorage`) must be wrapped in try/catch and must behave correctly when empty.

### Research Execution screen (done, simpler than first described)
An earlier version of this file described a richer Execution screen (a 780×650 canvas with rectangular nodes, a retrying state, pause/resume/abort, All/Events/Alerts filters, a simulated rate limit, `mockExecution.ts`/`useMockResearchRun.ts`). That version is not in the latest surviving checkpoint (`deepsearch_wip5.zip`). What exists:
- SVG topology (800×440 viewBox) with nine circular nodes and twelve edges (`components/execution/AgentTopology.tsx`). Node states: idle, running (pulse), done, skipped, error. Each node is labelled LLM, RULES + LLM (Verification, D19) or DETERMINISTIC.
- Header with the query, domain chips and routing rationale; stats for elapsed time, LLM calls against the budget of 8, sources found and claims checked; a progress bar; Skip to end and Replay; Open workspace and View report on completion; an activity feed with an LLM CALL tag on each call.
- `lib/executionEvents.ts` holds the agents, edges and a ~17.7 s sample run. `buildMockSequence(domains)` trims it to the run's domains, so a Legal-only or Finance-only choice skips the other manager and its workers. LLM calls: 7 on a combined run, 5 on a single-domain run. Page compression is embedding-based and is not counted as an LLM call.
- The run comes from the shared run store (below). `lib/streamReducer.ts` folds events into state; managers for domains that were not chosen, and any worker whose managers were all skipped, become `skipped`, so progress still reaches 100%.
- The header reads "Demo replay of sample events".
- Verified in the browser on 2026-10-12: combined, Legal-only and Finance-only runs; Ctrl+Enter submission; suggested-query clicks.
- Optional if time allows: re-add pause/abort and a retrying state.

### Final Report screen (done, Phase 3)
Ported from the Stitch `deepsearch_final_research_dossier_intelligence_report` screen with all its content replaced (`pages/ReportPage.tsx`, `components/report/`).
- Header: title, the question, generation time (UTC), domain chips, source and figure counts, engine badge; buttons for Workspace, Execution view, **Markdown** download and **Print / Save as PDF**.
- Left: sticky table of contents that highlights the section in view, and the **Report integrity** panel (figures filled / unresolved / typed outside placeholders, citations resolved / removed, sections dropped; "Checked by code, not by the LLM").
- Body: numbered sections ("01 //"); paragraphs with numbered citation chips; clicking a chip opens an inline **source card** (type, publication date or "Date unknown", retrieving agent, evidence excerpt, link or "No link (sample data)", and every finding that cites the source with its verification status). Key-figure tiles under the executive summary, finding cards, the chart, a figures table with methods, the timeline and a sources manifest.
- States: "still being written" while the run is going; an error banner if it stopped before a report existed.
- Lazy-loaded with the Workspace so Recharts stays out of the main bundle.
- Verified in the browser on 2026-10-12: combined, legal-only (finance section dropped and shown in the audit) and in-progress sample reports; a backend NVDA report with real data; citation cards; Markdown export checked in Node.

### Frontend hardening (done, Phase 9)
- **Responsive (D49):** `AppShell` owns a drawer state; `Sidebar` takes `open`/`onClose`; `TopBar` has the ☰ button and hides the breadcrumb and mode badge on narrow screens. The Dashboard action row wraps, and calculation rows stack under 640 px. No screen overflows horizontally at 375, 820 or 1280 px.
- **States:** `components/common/ErrorBoundary.tsx` (page and inline variants, resets on navigation); `RunLoading` while a run is fetched from the history; `pages/NotFoundPage.tsx` for unknown routes; Run again and Stop failures show inline instead of `alert()`.
- **Stop (D50):** a Stop button on the Execution screen for backend runs in progress; History shows "Stopped by you".
- **Accessibility:** a skip-to-content link; a global `:focus-visible` outline; `ToggleSwitch` announces its label and description; sidebar links set `aria-current` correctly for History vs Saved Reports; icon-only buttons have labels. Contrast (WCAG AA, 4.5:1) checked for the muted text tokens in both themes; three light values were darkened: outline #605e73, primary-container #6158e8, amber accent container #9a5f00.
- **Honesty fixes:** Login's "Mesh 4.2 · Live" chip is now the real mode badge; "Forgot password?" explains there are no accounts; Sign Up's version and Terms/Privacy links became the real version and a link to the Limits section. Claims carry `calculation_id`, so volatility shows 37.5% instead of +37.5% (only `ret_*` changes get a sign). The sidebar's Legal and Finance shortcuts open New Research with that domain chosen (`?mode=`).
- **Tests and scripts:** `npm test` (Vitest, `src/test/*.test.ts`, 11 tests) and `npm run typecheck`; the dead `lint` script (ESLint was never installed) was removed.

### Landing and Settings (done, Phase 8)
- **Landing** (`pages/LandingPage.tsx`, built from the earlier draft in `C:\Major project 4-1\LandingPage.tsx`): nav with theme toggle; hero with the real `AgentTopology` replaying the fictional sample on a loop (`hooks/useLoopingSample.ts`, nothing is stored) and labelled as such; a proof strip of true statements (every claim cited, code-filled figures, at most 8 LLM calls, 7 claim labels) instead of the mockup's counters; How it works; Domains with the claim-type chips; the three recorded scenarios as examples; Limits; CTA; footer. The Stitch landing `screen.png` in the export is broken (an HTML error page), so the layout follows the draft and the Stitch `code.html` text.
- **Settings** (`pages/SettingsPage.tsx`, Stitch layout): default research depth (with what each depth really changes: sources per search 5/8/12, price period 3/6/12 months), default domains, when a run finishes (auto-open report on the Execution screen, Web Audio chime with a Test button, show the fictional samples on the Dashboard), data in this browser (clear the local run list), appearance (theme cards with mini previews for Dark/Light/System, accent swatches, interface size Compact/Default/Large via the root font size, motion Follow system/Reduce/Full), and About & diagnostics from `/api/health` (connection and round trip with Test connection, mode, web search back end, LLM budget, scenario and history counts, versions, which free services are configured). A footer bar says changes save automatically and offers Reset to defaults.
- **Wired in:** New Research and the Dashboard start from the saved depth and domains; `components/common/RunFinishedEffects.tsx` plays the chime and opens the report only for runs that finish while you watch (not for runs reopened from history); `ThemeToggle` in the top bar and on Landing; `ModeBadge` in the top bar and the Dashboard (D48); the Dashboard greets by time of day; the sidebar shows the version from `lib/version.ts`. New Research's advanced source toggles now say plainly that they are a preview and not sent to the backend.

### Run store (done, Phase 1)
- `store/runStore.ts` (Zustand) holds every run keyed by research id: config, start time, and the state folded from its events by the pure `lib/streamReducer.ts`. Execution, Workspace and (later) Report read the same record, so a run keeps going when you change pages.
- Runs get real ids (`r…`). `startRun(config)` is called by Dashboard and New Research; Execution has Skip to end and Replay.
- **Two engines feed the same reducer (Phase 2):** *backend* runs stream from `WS /ws/research/{id}`; the store remembers the last `seq` and reconnects with `?after=` (up to 4 retries), and a server that no longer knows the run (restart) produces a "Run stopped" banner with "Run again". *Sample* runs use the deterministic replay. Each record stores its engine, and `engineLabel()` gives the honest label shown in Execution and Workspace.
- **Survives a reload:** only `{id, config, startedAt, skipped, engine}` is saved to localStorage (wrapped in try/catch, capped at 20 runs). Sample runs are rebuilt by replaying up to "now"; backend runs reconnect and get the backlog from the server.
- In development Vite proxies `/api` and `/ws` to `localhost:8000` (`vite.config.ts`), so there is no CORS setup and the socket shares the page's origin.
- The Dashboard's Recent Research lists the backend's five most recent runs (this browser's runs when the backend is off), then three fictional samples (`demo-1` combined, `demo-2` Legal, `demo-3` Finance, live replay), created on demand from `SAMPLE_RUNS` in `lib/runConfig.ts`. "View all" opens `/history`.
- **Saved history (Phase 7):** `useRun(id)` looks up an id this browser doesn't have with `GET /api/research/{id}`, and `adoptBackendRun()` opens it; the saved events then replay over the socket. So links work across browsers and after a cleared cache, and only an id the backend doesn't have shows "Run not found". The Research History page (`pages/ResearchHistoryPage.tsx`) has All runs and Saved reports tabs, a filter, Report and Workspace links, a save star and a two-step delete (`forgetRun()` also drops the run from this browser). With the backend off, it says so and lists this browser's runs. The Report page has a Save report button for backend runs. Times are shown in the viewer's time zone (`formatLocalDateTime`); data dates stay UTC (`formatDate`).

### Research Workspace screen (done, Phase 1)
Ported from the Stitch `deepsearch_active_research_workspace` screen, three panels:
- **Agents** (left): each agent's status, latest activity line and LLM / RULES + LLM / DETERMINISTIC label; an LLM call budget meter replaces the mockup's fake "compute metrics".
- **Findings** (centre): All / Legal / Finance / Cross-domain filters. Each finding shows its claim type (allegations amber), domain, verification status (hover explains the rule), a plain note for allegations ("Verified means the allegation was made, not that it is true"), any structured value and where it came from, and numbered citation chips. Below: the price chart (Recharts, timeline events marked as dashed lines) and the case timeline.
- **Sources** (right): All / Official / Company / News filters, citation number, how often each is cited, "No link (sample data)" instead of an invented URL, "Date unknown" when there is no date; selecting a source (or a citation chip) highlights the findings that cite it and shows its evidence excerpt.
- Header: query, Execution view, View report (enabled when complete), and elapsed / findings / sources / verified counts with a progress bar.
- The sample run (`lib/sampleRun.ts`) is fictional (Example Corp, ticker EXMP) with a synthetic price series generated in code; the one market-reaction figure (−9.8%) is computed from that same series, so even the demo follows D20.
- The Workspace page is lazy-loaded so only it downloads Recharts (~400 KB).
- Verified in the browser on 2026-10-12: navigating away and back mid-run, reloading mid-run, completion, citation selection, filters, unknown id, all three samples, phone width without horizontal scroll.

---

## 13. Backend knowledge

**Done:** folder scaffold; `requirements.txt` plus `requirements-lock.txt`; `.env.example`; `schemas.py` with reducers.

**Phase 2 (done): foundation and a finance slice, 44 passing tests (offline: stand-in LLM, fixture prices).**
- `config.py`: settings from env and `backend/.env`; Demo Mode = no Gemini key (auto).
- `providers/`: `LLMProvider` interface; `GeminiProvider` (google-genai, JSON forced by a Pydantic `response_schema`); `FakeLLMProvider`, the rule-based stand-in (keyword routing, ticker detection from `$TSLA`/`(TSLA)`/known names, template report). `CallCounter` enforces the budget of 8. Prompts in `providers/prompts.py`; structured outputs in `models/llm_outputs.py`.
- `utils/events.py`: per-run `EventBus` with history, `seq`, backlog replay and close.
- `graph/`: `RunContext` (bus, LLM + fallback, counter, price source) passed through LangGraph's config. Nodes: router (0 LLM calls with a manual domain, D7), finance manager, financial data (yfinance, 2 attempts, never fatal), data analysis (pandas: period return, annualised volatility, max drawdown, chart), report architect (placeholders filled and audited by `utils/placeholders.py`). Agents not built yet are marked "skipped: not built yet".
- `runs.py`: in-memory registry; runs execute as background tasks; failures publish an `error` event and mark running agents as errored.
- `api/`: the REST and WebSocket endpoints above; `main.py` `create_app()` takes an LLM and price source for tests.
- Verified live on 2026-10-12: "Analyze the recent stock performance of Tesla" fetched 125-127 real TSLA trading days and produced a report whose figures all came from stored calculations (audit clean).

**Phase 4 (done): recorded scenarios through the full graph, 64 passing tests.** Full graph shape (section 5); `graph/nodes/legal.py` (Legal Manager, Legal Records, Web Research: recorded replay, "not built yet" live); `graph/nodes/verification.py` with the rules engine `workers/verification.py`; event-window returns in `workers/analysis.py` (`EventWindow` in the Finance plan: close on the last trading day before an event to the first after it); `demo/scenarios.py` (scenario model, loader, `RecordedLLMProvider`, `SnapshotPriceSource`); `scripts/snapshot_prices.py`; tests `test_scenarios.py` and `test_verification_rules.py`.

**Phase 5 (done): live legal side, 90 passing tests.** Legal Manager plans live (Gemini or the stand-in: case name, court query, web queries); Legal Records searches CourtListener; Web Research uses GPT Researcher, Tavily or DuckDuckGo; EDGAR filings and results-filing event windows in Financial Data. Each worker gets two attempts and reports failures without crashing the run; missing services are reported, never faked. Clients take an injectable HTTP transport, and `tests/test_live_workers.py` covers parsing, errors, classification and filters with recorded-style responses; `tests/fixtures.py` has offline fakes so no test touches the network. Live smoke on 2026-10-13 (no keys): the Google search case query found 1:20-cv-03010 (D.D.C.) and the D.C. Circuit appeals 26-5023/26-5049; web research returned classified news; EDGAR listed Tesla's filings and four results reports.

**Phase 6 (done): live claim extraction, Gemini hardening, live check script. 110 passing tests.** `graph/nodes/verification.py` extracts claims on live runs too. It gives the extractor the sources, calculations, company, period and the Legal Manager's case name, and builds the live timeline (D36, D37, D40). `FakeLLMProvider._extract_claims` covers figures, filings and dockets, and `same_case()` matches docket captions to the named case ("USA" and "United States", "SEC" and "Securities"). `ExtractedClaim.timeline_label` was added. The extraction prompt now includes source dates, asks for at most 12 attributed claims and allows quoting a figure a source states. The report prompt receives the findings with their statuses. `providers/gemini.py` was rewritten (D38): the client is injectable, and `inline_schema()` is tested for every LLM output model. `RunContext.fallbacks` records the steps where Gemini failed. `runs.build_live_workers` wires GPT Researcher (D39). `scripts/live_smoke.py` runs real questions through the full pipeline with the keys in `backend/.env`: three standard questions, or `--query`. It prints the setup (never key values) and each run's agents, LLM calls, sources, claims, figures, timeline, audit and warnings, and exits 0 only if every run completes with at least one source and a clean audit. Live check on 2026-10-13 with no keys: 3 of 3 passed. Nvidia (1y) had 3 verified figure claims. The Google search case had 5 verified docket claims, and 4 timeline entries that left out Richards v. Google. Tesla + SEC (legal and finance) had 8 verified claims. DuckDuckGo rate-limited on one run, which was reported and not fatal. Gemini has still not been run against the real API, because no key is set on this machine. Budget with Gemini on both domains: router 1 + managers 2 + GPT Researcher up to 3 + extraction 1 + report 1 = 8.

**Phase 7 (done): saved history and reports, 114 passing tests.** `app/db/store.py` (`RunStore`: `run_started`, `run_finished`, `mark_interrupted`, `set_saved`, `delete`, `summary`, `list`, `load`) and `EventBus.replay()`. `RunRegistry` writes a row at start and at finish, and `get()` falls back to the database (D42, D43). New endpoints are in section 6. `create_app()` and `RunRegistry` accept a `store` for tests. Tests in `test_api.py`: a finished run survives a restart and its events replay identically; save, unsave and delete; a run cut off by a restart reads as interrupted; database path resolution.

**Phase 9 additions:** `POST /api/research/{id}/stop` and `ExecutionStatus.STOPPED` (D50), `Claim.calculation_id`, 115 backend tests.

**Not started (live):** rate limiting.

**Planned structure:** `app/main.py`, `config.py`, `api/` (routes and WebSocket), `graph/` (state, build_graph, `nodes/`), `workers/`, `providers/` (base, gemini, fake, openai stub), `demo/` (scenarios and replay runner), `models/schemas.py`, `db/`, `utils/` (logger, events). Keep the folder structure simple enough for students to explain in a viva.

**Code quality rules:** Python type hints; Pydantic models; secrets only in `.env`; graceful handling of API failures, missing data and timeouts; useful logs; one failed worker never crashes a run.

---

## 14. Current status

| Area | State |
|---|---|
| Repository | git; first commit is `deepsearch_wip5.zip` exactly as delivered |
| Frontend foundation (Vite, TS, Tailwind with real tokens, routing, fonts) | Done and verified (fonts bundled 2026-10-12) |
| Shared layout (Sidebar, TopBar, AppShell) | Done |
| Login, Sign Up, Dashboard, New Research | Done |
| Research Execution | Done, simpler version (section 12); domain-aware replay verified in the browser |
| Run store (shared by all research screens) | Done (Phase 1) |
| Research Workspace | Done (Phase 1) |
| Report contract and Final Report screen | Done (Phase 3) |
| Landing, Settings | Done (Phase 8): light/dark/system theme, accents, size, motion, research defaults, run-finished chime and auto-open, real diagnostics |
| Frontend hardening | Done (Phase 9): phone/tablet layout, error boundaries, Not Found, Stop button, accessibility pass, 11 Vitest tests |
| Backend | Full graph; finance and legal paths live (Phase 5); claim extraction and verification live and recorded (Phase 6); live check script; SQLite history and saved reports (Phase 7); 114 tests |
| Research History, Saved Reports | Done (Phase 7) |
| Demo scenarios | Three recorded runs with checked sources and real price snapshots, data as of 12 Oct 2026; Dashboard "Demo scenarios" section (Phase 4) |

**Remaining work, in order (reordered 2026-10-12 so the riskiest integration happens early):**
1. ~~Shared run store (keyed by research id) and the Research Workspace screen.~~ Done 2026-10-12.
2. ~~Backend foundation plus one thin end-to-end slice~~ Done 2026-10-12: config, `LLMProvider` with the call counter, event bus with backlog replay, REST + WebSocket, and Router → Finance Manager → Financial Data → Data Analysis → a minimal Report, streamed into the existing Execution screen.
3. ~~Report contract as a Pydantic model (with D20 placeholders), then the Final Report screen and citation panel.~~ Done 2026-10-12.
4. ~~Demo scenarios as recorded runs (D21), with real, dated data.~~ Done 2026-10-12, together with the full graph shape and the verification rules (D30).
5. ~~Live Legal Manager and workers: Legal Records (CourtListener), Web Research, EDGAR.~~ Done 2026-10-13.
6. ~~Live claim extraction for Verification, Gemini end-to-end, and the live smoke script.~~ Done 2026-10-13. Gemini is tested offline with a stubbed client; the first real-key run is the open item in section 19.
7. ~~Persistence (history, saved reports) and full integration.~~ Done 2026-10-13: runs saved in SQLite and reopenable after a restart or from another browser; Research History and Saved Reports pages; Dashboard and sidebar wired to them.
8. ~~Landing and Settings.~~ Done 2026-10-13, with a light theme, accent colours and an honest mode badge (D45–D48).
9. ~~Frontend hardening.~~ Done 2026-10-13 (D49–D52).
10. Hardening, docs and viva pack.

**Cut list if time runs short (drop in this order):** deployment; Settings polish; Deep depth; EDGAR filings; export; history persistence; Live Mode (last, and say so plainly if cut). Never cut: guardrails, the Router to Managers to Workers to Verification to Report structure, Demo Mode, honesty labels.

---

## 15. Content-integrity log

The approved Stitch mockups contained copy that cannot ship. Fixed so far:

| Screen | Removed | Replaced by |
|---|---|---|
| Login | "TLS 1.3 end-to-end encrypted session", pre-filled fake credentials | "Academic project, demo credentials only, nothing real is stored"; real placeholders |
| Sign Up | Fabricated litigation figures about a real case; "SOC2", "zero hallucination SLA", "ZK-proof" | Generic example labelled "Illustrative example, not real market data"; true trust badges |
| Dashboard | "ZERO-HALLUCINATION ENFORCED", "AIR-GAPPED", "SOC2 Type II 256-Bit", hardcoded name "Dr. Aris"; recent-research cards about real companies and cases with invented stats | "Citation Verification Active", "Demo Session, local build"; generic greeting; fictional examples |
| New Research | "ENCLAVE ISOLATED, 0-RETENTION MODE"; invented agent counts as capability claims | "LOCAL DEMO SESSION" |
| Execution | Throughput in KB/s, token counts, "SHA-256 signatures authenticated", invented docket numbers | Descriptions of what the real pipeline does; "SIMULATED RUN" badge |
| Sidebar | "SOC2 Type II" security badge | "Demo Session, local build" |
| Dashboard (2026-10-12) | Recent-research cards still carried a real docket number (N.D. Tex. No. 3:24-cv-00986, *Ryan LLC v. FTC*) and a thinly veiled real case, with invented source counts and timestamps; a "Patent IP" scope chip implying a third domain | Fictional sample entries without docket numbers, labelled "Fictional sample"; chip removed |
| Execution (2026-10-12) | Mock counted page compression as an LLM call and labelled Verification as a pure LLM agent | Compression not counted; Verification labelled RULES + LLM |
| Workspace (Phase 1) | Confidence percentages, "SHA-256 Validated", "Enclave: Zero-Knowledge", compute metrics and a "Zero-Knowledge Proof" badge, "Telemetry: Optimal", "Corporate Authenticated", "C-Suite Signed", "Cross-verified via SEC XBRL Engine", and DOJ v. Live Nation content with invented financials | Rule-based verification status with its explanation, an LLM call budget meter, fictional Example Corp sample with synthetic prices labelled as such |

| Final Report (Phase 3) | DOJ v. Live Nation content with invented financials and valuation scenarios, "Declassified & enclave-audited", "Verified consensus (99.8%)", "SHA-256 Validated", "Cryptographically verified (XBRL hash match)", "Authenticated", "multi-agent swarm ... zero hallucination" | Fictional Example Corp sample or real backend data; Report integrity panel showing what code actually checked; citation cards with real source fields |

Still to review when built: Landing (counters like "100% auditable"), Settings (fake registries, "SOC2/HIPAA", dead "Flush Cache"/"Export Audit Log" controls). The Report screen's extra "Research Dossier" sidebar item is an inconsistency to reconcile.

---

## 16. Working environment and practical knowledge

**How work is delivered (since 2026-10-12).** Claude works directly in the project folder through Claude Code Desktop on the user's Windows 11 laptop. The folder is a git repository: the first commit is `deepsearch_wip5.zip` exactly as delivered, and later commits are reviewable diffs. The patch-zip workflow and the old sandbox notes are retired.

**Location:** `C:\Users\kashi\OneDrive\Desktop\DeepSearch_final`. It sits inside OneDrive, so `node_modules` syncs (~100 MB); if npm ever fails with EPERM, pause OneDrive sync and retry. The Python virtual environment lives outside OneDrive at `%USERPROFILE%\.venvs\deepsearch`.

**Windows gotchas found on this machine:**
- **Smart App Control is on.** It blocks compiled Python files it has not seen widely yet: pydantic-core 2.50 (pydantic 2.14) fails with "An Application Control policy has blocked this file", while pydantic 2.13 loads fine, hence `pydantic<2.14`. If another package hits the same error, pin its previous version. Turning Smart App Control off is the user's decision; historically it could not be turned back on without reinstalling Windows.
- **Path length.** litellm (a GPT Researcher dependency) has very deep folders; a venv under a long path fails with WinError 206. Keep the venv path short.
- **WSL** (Ubuntu 26.04) is installed, but its Python 3.14 has no pip (`sudo apt install python3-pip python3-venv` would fix that), and 3.14 is too new for GPT Researcher's `numpy<2.3`. Native Windows is the simpler path.
- Git on this machine converts line endings; `.gitattributes` keeps LF so files behave the same in WSL.

**What can be verified locally:** `tsc` + `vite build`; `pytest`; the running app in the Claude Desktop browser pane (`.claude/launch.json` starts the dev server); pip and npm installs. Unlike the old sandbox, this machine can reach Gemini, Tavily, CourtListener, Yahoo Finance and EDGAR, so the price snapshot and live smoke scripts can run here once keys are added.

**Verification standard:** a green build is not proof. Each screen is checked with a real build, a bundle grep for removed claims, and scripted browser interaction.

**Practical rules carried over:**
- `lucide-react` 0.383 has no `Hub` icon; verify icon names against the installed package.
- Do not put side effects inside React state updater functions (StrictMode runs them twice).
- Scaled canvases need an `overflow-hidden` wrapper to avoid page-level horizontal scroll.
- `tsconfig.node.json` must not emit next to the source: Vite loads `vite.config.js` before `vite.config.ts`, so a stale compiled copy silently wins. Build output now goes to `node_modules/.tmp`.

**Run it locally:** see `README.md` (Windows PowerShell and macOS/Linux commands). In Claude Desktop, `.claude/launch.json` has two configs: `frontend` (Vite on 5173) and `backend` (uvicorn on 8000, using the venv's Python).

---

## 17. Security and licensing notes

- Never commit `.env`. `.gitignore` excludes it. Keys are read only from environment variables; `/api/health` reports only whether a provider is configured, never a value.
- The originally uploaded GPT Researcher archive contained a populated `.env` (xAI, Tavily, LangChain keys). It was verified as never committed to git history, but those keys were shared into a chat session. **Rotate them** (see open items).
- Planned security pass: CORS locked to configured origins, input length and type limits, per-session rate limiting, SSRF care in scraping (only fetch URLs returned by search providers; block private address ranges), dependency audit.
- GPT Researcher is MIT per its `pyproject.toml` (the LICENSE file text reads Apache-2.0); both permissive. Give credit in the README. Stitch output was generated by the user's own project.

---

## 18. Collaboration notes

- The user is a college student building this as a project with a viva; simplicity of explanation matters. They work in a local IDE, prefer short confirmations ("ok", "proceed"), and expect Claude to keep moving with the next step.
- Chat style: the user invoked `/caveman` mode, so chat replies are terse. Files and documents (including this one) are written in normal prose.
- Decisions the user has confirmed: build frontend first from Stitch designs; Claude builds (not Codex); GPT Researcher as a narrow dependency; guest Demo Mode on login screens; honest copy over mockup claims.
- Likely questions to prepare for in the viva: why multi-agent, why separate planning from execution, how hallucination is controlled (claim types, deterministic numbers, number audit, citation resolution), what is deterministic versus LLM, why GPT Researcher, what it costs (₹0 and why), what is real versus simulated, what the limits are.

---

## 19. Open items

- **Rotate** the xAI, Tavily and LangChain keys that were pasted into an earlier chat session.
- Optional, free, makes live research reliable: a Tavily API key, a CourtListener token, and `SEC_EDGAR_USER_AGENT` with your own email, all in `backend/.env`.
- Shortly before the viva, refresh the scenarios: re-run `scripts/snapshot_prices.py` for `tesla_recent_performance`, re-check the Google docket for newer entries (an appeal argument may be scheduled), update `data_as_of`, then run the tests.
- Check in AI Studio which Gemini models this project's free tier allows, and its daily limit.
- Run the live check with a real Gemini key: put `GEMINI_API_KEY` in `backend/.env`, then from `backend` run `& "$HOME\.venvs\deepsearch\Scripts\python.exe" scripts/live_smoke.py`. Every LLM call should be labelled Gemini, no step should fall back, and all three runs should pass. If `GEMINI_MODEL` is rejected (HTTP 404 or 400), pick a model that AI Studio lists for the free tier.
- Later, after Phase 10 (user's decision, 2026-10-13): real sign-in with Firebase Authentication (free Spark plan). Work involved: Firebase SDK on Login/Sign Up and a route guard; the backend verifies the Firebase ID token on each request (`firebase-admin`); a `user_id` column on `runs` so each person sees only their own history and saved reports. Until then sign-in stays a demo screen (D5).
- Optional: a real name for the Dashboard greeting.
- Optional: a retrying state on the Execution screen (Stop exists since Phase 9; pause was dropped, D50).
- Optional: upgrade Recharts 2 to 3 (npm reports 2.x as no longer maintained).
- `deepsearch_terminal_authentication_1` is treated as discarded.

---

## 20. Glossary

- **Gateway Router:** first agent; classifies the query and routes it.
- **Domain Manager:** planning agent for one domain (Legal Manager, Finance Manager).
- **Worker:** deterministic execution component shared by managers.
- **Dynamic Matrix:** domains as rows, shared workers as columns; any manager can use any worker.
- **Claim type:** the epistemic status of a statement (established fact, allegation, party claim, and so on).
- **Verification status:** verified, corroborated, unverified or conflicting.
- **Demo Mode / Live Mode:** frozen real data replay versus real free-tier API calls, through the same pipeline.
- **Number audit:** code check that every number in the financial report sections traces to a stored calculation.
- **Event bus:** per-run pub/sub that carries agent and activity events from the graph to the WebSocket.
- **Patch zip:** a zip containing only the files changed in a checkpoint (retired 2026-10-12 in favour of git).
- **Stitch:** Google's AI UI design tool used to design the screens.
