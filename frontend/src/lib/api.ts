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
