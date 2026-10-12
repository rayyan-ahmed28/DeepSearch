import { describe, expect, it } from "vitest";

import { citationNumbers, reportToMarkdown } from "@/lib/report";
import { buildMockSequence } from "@/lib/sampleRun";
import { initialStreamState, streamReducer } from "@/lib/streamReducer";

function sampleReport() {
  const state = buildMockSequence(["legal", "finance"], false, "t3", "Sample question")
    .map((s) => s.event)
    .reduce(streamReducer, initialStreamState());
  if (!state.report) throw new Error("the sample run produced no report");
  return state.report;
}

describe("report", () => {
  it("cites only sources the report carries", () => {
    const report = sampleReport();
    const numbers = citationNumbers(report);
    for (const section of report.sections) {
      for (const block of section.blocks) {
        const cited = "citations" in block ? block.citations : [];
        for (const id of cited) expect(numbers[id], `citation ${id} in ${section.id}`).toBeDefined();
      }
    }
  });

  it("exports Markdown with the title, numbered sources and the disclaimer, and no raw placeholders", () => {
    const report = sampleReport();
    const md = reportToMarkdown(report, "Demo replay of sample events");
    expect(md.startsWith(`# ${report.title}`)).toBe(true);
    expect(md).toContain("[1]");
    expect(md).toMatch(/not legal or investment advice/i);
    expect(md).not.toContain("{{calc:");
  });
});
