/** Backend client. In development, Vite proxies /api and /ws to the FastAPI server on :8000. */
import type { RunConfig } from "@/lib/runConfig";

export interface CreatedRun {
  research_id: string;
  llm_provider: "gemini" | "fake";
  demo_mode: boolean;
}

export type CreateResult = { ok: true; run: CreatedRun } | { ok: false; reason: string };

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
 * Start a run on the backend. Checks /api/health first, so a stopped backend
 * is reported as "not running" rather than as a server error.
 */
export async function createResearch(config: RunConfig): Promise<CreateResult> {
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
        body: JSON.stringify({ query: config.query, mode: config.mode, depth: config.depth }),
      },
      5000,
    );
    if (!res.ok) return { ok: false, reason: `Backend error (${res.status})` };
    return { ok: true, run: (await res.json()) as CreatedRun };
  } catch {
    return { ok: false, reason: "Backend did not respond" };
  }
}

export function researchSocketUrl(researchId: string, after: number): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws/research/${encodeURIComponent(researchId)}?after=${after}`;
}

/** Close code the backend uses when it does not know the run (e.g. it was restarted). */
export const RUN_NOT_FOUND_CLOSE_CODE = 4404;
