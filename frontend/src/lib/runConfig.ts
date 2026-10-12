import type { DomainName } from "@/lib/executionEvents";

/** Mirrors backend `ResearchRequest.mode` (app/models/schemas.py). */
export type ResearchMode = "auto" | "legal" | "finance" | "legal_finance";

export type ResearchDepth = "quick" | "standard" | "deep";

/** What a "Start Research" button hands to the run store. */
export interface RunConfig {
  query: string;
  mode: ResearchMode;
  depth: ResearchDepth;
}

export const DEFAULT_SAMPLE_QUERY = "Sample run: legal dispute and stock impact for a fictional company";

/**
 * Domains a run covers. A manual choice overrides routing (decision D7).
 * "auto" stands in for the Router's classification; the sample replay uses
 * the combined Legal + Finance case.
 */
export function domainsForMode(mode: ResearchMode | undefined): DomainName[] {
  if (mode === "legal") return ["legal"];
  if (mode === "finance") return ["finance"];
  return ["legal", "finance"];
}

export interface SampleRunDef {
  config: RunConfig;
  /** Shown as already finished, or replayed live when opened. */
  completed: boolean;
}

/**
 * Fictional entries on the Dashboard's Recent Research list. Opening one
 * creates its run on demand. Placeholder until persistence lands (Phase 7).
 */
export const SAMPLE_RUNS: Record<string, SampleRunDef> = {
  "demo-1": {
    config: { query: "Example Corp: the regulator's case and its stock-price impact", mode: "legal_finance", depth: "standard" },
    completed: true,
  },
  "demo-2": {
    config: { query: "Example Corp: current status of the regulator's case", mode: "legal", depth: "standard" },
    completed: true,
  },
  "demo-3": {
    config: { query: "Example Corp: market reaction to the court ruling", mode: "finance", depth: "quick" },
    completed: false,
  },
};

export function isSampleRunId(id: string): boolean {
  return id in SAMPLE_RUNS;
}
