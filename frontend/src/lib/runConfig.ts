import type { DomainName } from "@/lib/executionEvents";

/** Mirrors backend `ResearchRequest.mode` (app/models/schemas.py). */
export type ResearchMode = "auto" | "legal" | "finance" | "legal_finance";

export type ResearchDepth = "quick" | "standard" | "deep";

/** What a "Start Research" button hands to the Execution screen via router state. */
export interface RunConfig {
  query: string;
  mode: ResearchMode;
  depth: ResearchDepth;
}

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
