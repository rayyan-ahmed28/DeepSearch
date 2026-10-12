/** Backend client. In development, Vite proxies /api and /ws to the FastAPI server on :8000. */
import type { DomainName } from "@/lib/executionEvents";
import type { RunConfig } from "@/lib/runConfig";

export type LlmProvider = "gemini" | "fake" | "recorded";

export interface CreatedRun {
  research_id: string;
  llm_provider: LlmProvider;
  demo_mode: boolean;
  scenario: { id: string; data_as_of: string } | null;
}

export type CreateResult = { ok: true; run: CreatedRun } | { ok: false; reason: string };

/** A recorded demo run (D21) that replays through the live pipeline. */
export interface DemoScenario {
  id: string;
  title: string;
  description: string;
  query: string;
  domains: DomainName[];
  data_as_of: string;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Start a run on the backend (optionally a recorded scenario). Checks
 * /api/health first, so a stopped backend is reported as "not running"
 * rather than as a server error.
 */
export async function createResearch(config: RunConfig, scenarioId?: string): Promise<CreateResult> {
  try {
    const health = await fetchWithTimeout("/api/health", {}, 1500);
    if (!health.ok) return { ok: false, reason: "Backend not running" };
  } catch {
    return { ok: false, reason: "Backend not running" };
  }
  try {
    const res = await fetchWithTimeout(
      "/api/research",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: config.query, mode: config.mode, depth: config.depth, scenario_id: scenarioId ?? null }),
      },
      5000,
    );
    if (!res.ok) return { ok: false, reason: `Backend error (${res.status})` };
    return { ok: true, run: (await res.json()) as CreatedRun };
  } catch {
    return { ok: false, reason: "Backend did not respond" };
  }
}

/** The recorded scenarios, or null when the backend is not running. */
export async function listScenarios(): Promise<DemoScenario[] | null> {
  try {
    const res = await fetchWithTimeout("/api/demo/scenarios", {}, 2000);
    return res.ok ? ((await res.json()) as DemoScenario[]) : null;
  } catch {
    return null;
  }
}

export function researchSocketUrl(researchId: string, after: number): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws/research/${encodeURIComponent(researchId)}?after=${after}`;
}

/** Close code the backend uses when it does not know the run (e.g. it was restarted). */
export const RUN_NOT_FOUND_CLOSE_CODE = 4404;

// ── Saved history (Phase 7) ────────────────────────────────────────
/** One run in the backend's saved history (mirrors backend `db/store.py`). */
export interface HistoryEntry {
  research_id: string;
  query: string;
  mode: RunConfig["mode"];
  depth: RunConfig["depth"];
  /** "interrupted": the backend stopped while the run was in progress. */
  status: "running" | "completed" | "failed" | "interrupted";
  created_at: string;
  finished_at: string | null;
  llm_provider: LlmProvider;
  demo_mode: boolean;
  scenario: { id: string; data_as_of: string } | null;
  title: string | null;
  domains: DomainName[];
  source_count: number;
  claim_count: number;
  saved: boolean;
}

/** Research history, newest first, or null when the backend is not running. */
export async function listHistory(savedOnly = false, limit = 50): Promise<HistoryEntry[] | null> {
  try {
    const res = await fetchWithTimeout(`/api/research?saved=${savedOnly}&limit=${limit}`, {}, 3000);
    return res.ok ? ((await res.json()) as HistoryEntry[]) : null;
  } catch {
    return null;
  }
}

/** One run's history entry: "missing" if the backend doesn't have it, null if the backend is down. */
export async function getHistoryEntry(researchId: string): Promise<HistoryEntry | "missing" | null> {
  try {
    const res = await fetchWithTimeout(`/api/research/${encodeURIComponent(researchId)}`, {}, 3000);
    if (res.status === 404) return "missing";
    return res.ok ? ((await res.json()) as HistoryEntry) : null;
  } catch {
    return null;
  }
}

/** Add a finished report to Saved Reports, or remove it. Returns the updated entry, or null on failure. */
export async function setSaved(researchId: string, saved: boolean): Promise<HistoryEntry | null> {
  try {
    const res = await fetchWithTimeout(
      `/api/research/${encodeURIComponent(researchId)}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saved }) },
      3000,
    );
    return res.ok ? ((await res.json()) as HistoryEntry) : null;
  } catch {
    return null;
  }
}

/** Delete a finished run from the history. True if it is gone (or was already). */
export async function deleteRun(researchId: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`/api/research/${encodeURIComponent(researchId)}`, { method: "DELETE" }, 3000);
    return res.status === 204 || res.status === 404;
  } catch {
    return false;
  }
}

// ── Backend health (top-bar mode badge, Settings diagnostics) ──────
/** What GET /api/health reports: configuration booleans only, never key values. */
export interface Health {
  status: "ok";
  version: string;
  demo_mode: boolean;
  llm_provider: "gemini" | "fake";
  llm_model: string | null;
  llm_call_budget: number;
  web_search: string | null;
  providers: { gemini: boolean; tavily: boolean; courtlistener: boolean; sec_edgar: boolean };
  scenarios: number;
  history_runs: number;
}

/** Health plus the measured round trip, or null when the backend is not running. */
export async function fetchHealth(): Promise<{ health: Health; latencyMs: number } | null> {
  const started = performance.now();
  try {
    const res = await fetchWithTimeout("/api/health", {}, 2000);
    if (!res.ok) return null;
    const health = (await res.json()) as Health;
    return { health, latencyMs: Math.round(performance.now() - started) };
  } catch {
    return null;
  }
}
