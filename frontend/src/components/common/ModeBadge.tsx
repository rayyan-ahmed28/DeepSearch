import { useBackendHealth } from "@/hooks/useBackendHealth";

/** Honest run mode, from /api/health: sample replay, live data with the stand-in, or live with Gemini. */
export default function ModeBadge() {
  const { snapshot } = useBackendHealth();
  const mode =
    snapshot === undefined
      ? { label: "CHECKING", dot: "bg-outline", title: "Checking the backend" }
      : snapshot === null
        ? { label: "SAMPLE MODE", dot: "bg-warning", title: "Backend not running: new runs replay fictional sample data" }
        : snapshot.health.llm_provider === "gemini"
          ? { label: "LIVE · GEMINI", dot: "bg-tertiary animate-pulse", title: `Live data, ${snapshot.health.llm_model ?? "Gemini"}` }
          : { label: "LIVE DATA · RULE-BASED", dot: "bg-tertiary", title: "Live data; a rule-based stand-in replaces the LLM (no Gemini key)" };
  return (
    <div
      title={mode.title}
      className="flex items-center gap-2 px-3 py-1 rounded bg-surface-container border border-outline-variant/40 font-label-code-sm text-label-code-sm text-on-surface-variant"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${mode.dot}`} />
      <span>{mode.label}</span>
    </div>
  );
}
