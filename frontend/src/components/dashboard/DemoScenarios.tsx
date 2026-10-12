import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarCheck, Gavel, LineChart, Loader2, PlayCircle, ServerOff } from "lucide-react";

import { listScenarios, type DemoScenario } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useRunStore } from "@/store/runStore";

/**
 * Recorded demo scenarios (D21): real, dated sources and prices, replayed
 * through the live pipeline. Only the backend can replay them.
 */
export default function DemoScenarios() {
  const navigate = useNavigate();
  const startRun = useRunStore((s) => s.startRun);
  const [scenarios, setScenarios] = useState<DemoScenario[] | null | "loading">("loading");
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listScenarios().then((list) => alive && setScenarios(list));
    return () => {
      alive = false;
    };
  }, []);

  async function play(scenario: DemoScenario) {
    setStarting(scenario.id);
    setError(null);
    try {
      const id = await startRun({ query: scenario.query, mode: "auto", depth: "standard" }, scenario.id);
      navigate(`/research/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the scenario.");
      setStarting(null);
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="demo-scenarios-heading">
      <div className="flex flex-col gap-0.5">
        <h2 id="demo-scenarios-heading" className="font-headline-md text-headline-md text-on-surface font-semibold">
          Demo scenarios
        </h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Recorded runs with real, dated sources and prices. They replay through the live pipeline, which recomputes every
          figure and verification status.
        </p>
      </div>

      {scenarios === "loading" && (
        <div className="flex items-center gap-2 font-body-sm text-body-sm text-outline">
          <Loader2 size={14} className="animate-spin" /> Checking the backend…
        </div>
      )}

      {scenarios === null && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-surface-container-low border border-dashed border-outline-variant/40">
          <ServerOff size={18} className="text-outline shrink-0 mt-0.5" />
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            The backend isn't running, so the recorded scenarios can't be replayed. Start it from the{" "}
            <span className="font-label-code-sm text-label-code-sm text-on-surface">backend</span> folder with{" "}
            <span className="font-label-code-sm text-label-code-sm text-on-surface">python -m uvicorn app.main:app --port 8000</span>.
            Research still works offline as a sample replay.
          </p>
        </div>
      )}

      {Array.isArray(scenarios) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {scenarios.map((s) => (
            <article
              key={s.id}
              className="flex flex-col gap-3 p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 hover:border-primary-container transition-colors"
            >
              <div className="flex items-center gap-2 flex-wrap">
                {s.domains.includes("legal") && (
                  <span className="flex items-center gap-1 font-tag-caps text-tag-caps uppercase text-secondary bg-secondary/10 rounded px-1.5 py-0.5">
                    <Gavel size={11} /> Legal
                  </span>
                )}
                {s.domains.includes("finance") && (
                  <span className="flex items-center gap-1 font-tag-caps text-tag-caps uppercase text-tertiary bg-tertiary/10 rounded px-1.5 py-0.5">
                    <LineChart size={11} /> Finance
                  </span>
                )}
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface leading-snug">{s.title}</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant flex-1">{s.description}</p>
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-outline-variant/20">
                <span className="flex items-center gap-1.5 font-label-code-sm text-label-code-sm text-outline">
                  <CalendarCheck size={13} /> Data as of {formatDate(s.data_as_of)}
                </span>
                <button
                  type="button"
                  disabled={starting !== null}
                  onClick={() => play(s)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-container text-on-primary-container font-body-sm text-body-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {starting === s.id ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
                  Run scenario
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {error && <p role="alert" className="font-body-sm text-body-sm text-error">{error}</p>}
    </section>
  );
}
