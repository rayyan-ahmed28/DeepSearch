import { describe, expect, it } from "vitest";

import { AGENTS, LLM_CALL_BUDGET, type ExecEvent } from "@/lib/executionEvents";
import { buildMockSequence } from "@/lib/sampleRun";
import { initialStreamState, streamReducer } from "@/lib/streamReducer";

const fold = (events: ExecEvent[]) => events.reduce(streamReducer, initialStreamState());

describe("streamReducer", () => {
  it("folds the full sample run into a finished state with a report", () => {
    const state = fold(buildMockSequence(["legal", "finance"], false, "t1", "q").map((s) => s.event));
    expect(state.done).toBe(true);
    expect(state.error).toBeNull();
    expect(state.report).not.toBeNull();
    expect(state.llmCalls).toBeLessThanOrEqual(LLM_CALL_BUDGET);
    for (const agent of AGENTS) expect(["done", "skipped"]).toContain(state.agents[agent.id].status);
  });

  it("skips the other domain's agents on a single-domain run", () => {
    const state = fold(buildMockSequence(["legal"], true, "t2", "q").map((s) => s.event));
    expect(state.domains).toEqual(["legal"]);
    expect(state.agents.finance_manager.status).toBe("skipped");
    expect(state.agents.legal_manager.status).toBe("done");
  });

  it("keeps one copy of a source the server sends twice (reconnect replay)", () => {
    const source = { id: "s1", title: "A", url: "https://example.com", source_type: "secondary", retrieved_by: "web_research" } as const;
    const state = fold([
      { type: "source_found", payload: source },
      { type: "source_found", payload: { ...source, title: "A (updated)" } },
    ] as ExecEvent[]);
    expect(state.sources).toHaveLength(1);
    expect(state.sources[0].title).toBe("A (updated)");
  });

  it("records an error and logs it, and ignores event types it doesn't know", () => {
    const state = fold([
      { type: "error", payload: { message: "You stopped this run." } },
      { type: "something_new", payload: {} } as unknown as ExecEvent,
    ]);
    expect(state.error).toBe("You stopped this run.");
    expect(state.logs.at(-1)).toMatchObject({ agent: "system", level: "error" });
  });

  it("orders the timeline by date whatever order it arrives in", () => {
    const state = fold([
      { type: "timeline_ready", payload: { events: [
        { date: "2026-03-10", label: "b", description: "", source_ids: [] },
        { date: "2020-10-20", label: "a", description: "", source_ids: [] },
      ] } },
    ]);
    expect(state.timeline.map((t) => t.label)).toEqual(["a", "b"]);
  });
});
