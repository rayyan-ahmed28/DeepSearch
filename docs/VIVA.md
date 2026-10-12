# DeepSearch: viva pack

Everything for presenting DeepSearch: a one-page explanation, a demo script, what is real and what is
simulated, likely questions with short answers, and a checklist for the day. Details and the reasoning behind
every choice are in [`KNOWLEDGE.md`](KNOWLEDGE.md) (decisions D1–D52).

---

## 1. DeepSearch on one page

**Problem.** Answering "how did this lawsuit affect this company's stock?" means reading court records,
regulator releases, filings, news and price data, then keeping facts, allegations and numbers straight.
General chatbots answer fluently but invent cases, figures and citations.

**Idea.** A *dynamic matrix* of agents: a Router picks the domains, a Manager per domain plans, shared
Workers fetch and compute, Verification judges claims with fixed rules, and a Report Architect writes. Models
plan and write; ordinary code fetches data and does all the arithmetic.

| Layer | Agents | Kind |
|---|---|---|
| Routing | Gateway Router | LLM (skipped if you pick the domain yourself) |
| Planning | Legal Manager, Finance Manager (in parallel) | LLM |
| Doing | Legal Records (CourtListener), Web Research (Tavily, DuckDuckGo or GPT Researcher), Financial Data (Yahoo Finance, SEC EDGAR), Calculator (pandas) | Code |
| Checking | Verification | LLM extracts claims, **rules** decide each status |
| Writing | Report Architect | LLM writes, **code** fills every figure and audits the report |

**Five guarantees, all enforced in code:**
1. At most **8 LLM calls** per run (a counter refuses the ninth).
2. **No number from the model**: it writes `{{calc:ret_period}}`, code fills it from pandas, and the audit flags any
   other number.
3. **Every citation resolves** to a source this run actually retrieved; others are removed and counted.
4. **Statuses come from rules**: official/court source or computed figure = verified; two independent domains =
   corroborated; sources that disagree on a date or figure = conflicting; otherwise unverified.
5. **Claim types are kept apart**: an allegation can never be an "established fact" unless an official source
   or a calculation backs it.

**Stack.** React 18 + TypeScript + Tailwind (frontend); FastAPI + LangGraph + Pydantic (backend); SQLite for
history; Gemini when a key is set, otherwise a rule-based stand-in. Live progress streams over a WebSocket.
All services are free tier. 123 backend and 12 frontend tests, all offline.

---

## 2. Demo script (about 8 minutes)

**Before you start:** run `start.cmd`, open http://localhost:5173, and check the top bar badge
(*Live data · rule-based*, or *Live · Gemini* with a key). Keep `docs/VIVA.md` open in another window.

1. **Landing page (30 s).** "The graph in the hero is the real execution component, replaying a fictional
   sample." Point at the proof strip: every claim cited, figures filled by code, at most 8 LLM calls.
2. **Sign in → Continue as guest → Dashboard (15 s).** "Sign-in is a demo screen; accounts are out of scope."
3. **Recorded demo: SEC v. Musk (2–3 min).** Dashboard → *Demo scenarios* → **Run scenario** on the SEC case.
   - On the Execution screen: the Router picks Legal + Finance, both Managers plan in parallel, the LLM-call
     counter climbs (stays ≤ 8), workers turn green.
   - Say: "These sources were gathered and checked on 12 October 2026. The model outputs were prepared from
     them in the exact format Gemini returns, and are replayed, but every figure and every verification status
     is recomputed by code right now."
   - Open **Workspace**: findings with types and statuses; click a source; the price chart with the event
     markers.
   - Open the **Report**: SEC charges −14.5%, settlement +17.4% (both computed from the price snapshot). Click a
     citation number to show the source card. Show the **Report integrity** panel: figures filled from
     stored calculations, numbers typed outside placeholders: 0, citations that resolve to a retrieved source.
4. **A live question (2 min).** New Research → *"What is the latest status of the antitrust case United States
   v. Google LLC over search?"* → Start. It queries CourtListener for real. In the Workspace: verified docket
   findings and a case timeline that includes only dockets of the named case (an unrelated *Richards v.
   Google* is left out). If web search is rate-limited, the run says so and still finishes.
5. **Finance live (1 min).** *"How has Nvidia stock performed over the last year?"* Real Yahoo prices; return,
   volatility and drawdown computed in pandas; the report table shows the method of each figure.
6. **History and settings (1 min).** Research History: every run saved in SQLite, reopens exactly as it was,
   even after a restart; star a report into Saved Reports. Settings: switch to light mode and an accent
   colour; *About & diagnostics* shows which free services are configured and the round trip.
7. **Stop (optional, 20 s).** Start a recorded demo and press **Stop**: "Cancelled cleanly, what was found is
   kept, and History records it as stopped."

**If the internet fails:** the recorded demos need no network (sources and prices are stored). If the
backend fails: the frontend still runs the clearly labelled fictional sample replay.

---

## 3. What is real, what is simulated

| Part | In a live run | In a recorded demo | Backend off |
|---|---|---|---|
| Court dockets | Real (CourtListener API) | Real, gathered 12 Oct 2026 | Fictional sample |
| Web sources | Real (Tavily or DuckDuckGo; GPT Researcher with Gemini) | Real articles and official pages, each URL opened and checked | Fictional sample |
| SEC filings | Real (EDGAR), when `SEC_EDGAR_USER_AGENT` is set | Real filings | Fictional sample |
| Prices | Real (Yahoo Finance, split-adjusted) | Real snapshot taken 12 Oct 2026 | Synthetic series |
| Figures (returns, volatility, drawdown) | Computed by pandas now | **Recomputed by pandas now** from the snapshot | From the synthetic series |
| LLM steps (routing, plans, claims, report text) | Gemini with a key; otherwise the **rule-based stand-in**, labelled as such | **Prepared** from the checked sources in Gemini's output format, replayed | Scripted sample |
| Verification statuses | Rules, now | **Rules, now** | Scripted sample |
| Report audit | Code, now | **Code, now** | Code, in the browser |

Every screen says which of these you are looking at (badges on Execution, Workspace and Report; the top bar
mode badge). Gemini itself has only been tested against a simulated client unless you ran
`live_smoke.py` with a real key (see the checklist).

---

## 4. Likely questions

**Why multiple agents instead of one big prompt?**
Each step has a different job and a different trust level. Planning benefits from a model; fetching and
arithmetic must be repeatable. Splitting them lets the graph run Legal and Finance in parallel, cap LLM calls,
and check every step's output in code. One prompt would hide all of that.

**Why separate planning from execution?**
Models are good at deciding *what* to look for and bad at exact facts and numbers. So the Managers only output
a typed plan (case name, court query, ticker, period); workers carry it out with APIs and pandas. The model
never touches the data it could misquote.

**How do you control hallucination?**
Five ways: (1) models return Pydantic-validated JSON, not free text; (2) figures are placeholders filled by
code, and the audit flags any number the model typed; (3) citations must point to sources this run retrieved,
others are removed; (4) verification statuses come from rules, never from the model; (5) a claim cannot be an
established fact without an official source or a calculation. If no court record is found, the report says so
instead of inventing one.

**What exactly is deterministic and what is LLM?**
LLM: Router, the two Managers, claim extraction in Verification, and the Report Architect's prose (at most 8
calls). Code: every search and API call, all calculations, source classification, verification statuses,
placeholder filling, citation checks, the timeline filter and the report structure.

**Why LangGraph?**
It gives a typed shared state, parallel branches with join points (Legal and Finance run side by side and
meet at Verification) and reducers so parallel branches merge their sources without overwriting each other.
The same graph runs live runs and recorded demos.

**Why GPT Researcher, and why only partly?**
It is a mature open-source library for searching and summarising the web. DeepSearch uses it narrowly, as the
web-research worker when Gemini is configured, and counts its LLM calls against the budget. Without Gemini,
Tavily or DuckDuckGo are called directly.

**How does verification work? Give an example.**
"The SEC charged Musk with securities fraud" cites the SEC's own press release (sec.gov is classed as
regulatory), so it is *verified*. "Shares fell 14.5% across the charges" is computed by pandas from the price
data, so it is *verified* against that data. A claim backed only by one news site is *unverified*; by two
independent outlets, *corroborated*. If two sources give different dates for the same event, both claims are
marked *conflicting* and shown side by side.

**How are the figures calculated?**
Period return = last close / first close − 1. Volatility = standard deviation of daily returns × √252.
Maximum drawdown = the worst fall from a running peak. Event move = close on the last trading day before the
event to the first trading day after it, so news after market close is captured. Each figure stores its method,
shown in the report.

**What does it cost?**
Nothing. Gemini's free tier, Tavily's free credits, CourtListener, SEC EDGAR, Yahoo Finance and DuckDuckGo are
free; with no keys at all it still runs (rule-based stand-in plus keyless sources). Rate limits (10 new runs a
minute, 3 at once) protect the free quotas.

**What happens when an API is down or rate-limited?**
Each worker gets two attempts, then reports the failure and the run continues; the report's *What this run did
not cover* lists it. If Gemini fails, that one step falls back to the stand-in and the report says which steps.
A run that exceeds the LLM budget stops cleanly.

**Isn't the recorded demo just fake?**
Its sources and prices are real and dated; its model outputs were prepared in advance (labelled). But it runs
through the same graph: figures are recomputed from the price snapshot, statuses by the rules, and the report
is re-audited during the replay. Tests reject a recording whose citations don't resolve or whose figures don't
match its prices.

**How would you add a new domain, say healthcare?**
Add a Manager node and its plan schema, any domain workers (e.g. a clinical-trials API), source-type rules for
its official sources, and the domain's report sections. The Router, Verification, Report Architect, event
stream and UI are shared.

**How is it different from ChatGPT or Perplexity?**
They answer in prose with links. DeepSearch shows its work: the plan, every agent's activity, which source
supports which claim, how each claim was judged, and a machine-checked audit of every figure and citation. It
also refuses to state what it could not verify.

**How did you test it?**
123 backend tests run offline with fake services and recorded HTTP responses: schemas, the graph, workers,
the verification rules, the report audit, all three scenarios, history and rate limits. 12 frontend tests
cover the event stream, report export and formatting. `live_smoke.py` checks the real services end to end.

**What are its limits?**
Without Gemini, live findings come only from structured records (news is cited, not read). Claims are drawn
from search excerpts, not full documents. DuckDuckGo rate-limits. It is a research aid, not legal or investment
advice, and has no real accounts yet (Firebase is planned).

---

## 5. Checklist for the day before

- [ ] **Refresh the recorded demos** so their data is recent: re-run
      `scripts/snapshot_prices.py tesla_recent_performance TSLA <start> <end>` from `backend` (six months to
      yesterday), re-check the Google docket on CourtListener for newer entries, update each scenario's
      `data_as_of`, then run `test.cmd` (it rejects a scenario that no longer matches).
- [ ] **Rotate** the xAI, Tavily and LangChain keys that were pasted into an earlier chat (see KNOWLEDGE.md §19).
- [ ] Optional: add a free `GEMINI_API_KEY` and `TAVILY_API_KEY` to `backend\.env`, then run
      `python scripts/live_smoke.py` from `backend`: all three questions should PASS and every LLM call should
      say Gemini.
- [ ] Run `test.cmd`: all tests pass.
- [ ] Run `start.cmd` on the presentation laptop and click through the demo script once.
- [ ] Close OneDrive sync and heavy apps; set the browser zoom so the Execution graph fits the projector.
- [ ] Have the recorded demos ready as the fallback if the venue's internet is poor.
