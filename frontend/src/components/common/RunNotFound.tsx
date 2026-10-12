import { useNavigate } from "react-router-dom";
import { SearchX } from "lucide-react";

/** Shown when a research id isn't in this browser (runs live in localStorage until persistence lands). */
export default function RunNotFound({ id }: { id: string }) {
  const navigate = useNavigate();
  return (
    <div className="w-full max-w-xl mx-auto px-8 py-24 flex flex-col items-center text-center gap-4">
      <SearchX size={32} className="text-outline" />
      <h1 className="font-headline-md text-headline-md text-on-surface">This run isn't in this browser</h1>
      <p className="font-body-md text-body-md text-on-surface-variant">
        Research <span className="font-label-code-md text-label-code-md text-on-surface">{id}</span> was not found. Runs are
        kept in this browser only until saved history is added.
      </p>
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <button
          onClick={() => navigate("/research/new")}
          className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-medium hover:opacity-90 transition-opacity font-body-md text-body-md"
        >
          Start new research
        </button>
        <button
          onClick={() => navigate("/research/demo-1/workspace")}
          className="px-4 py-2 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high transition-colors font-body-md text-body-md"
        >
          Open the sample run
        </button>
      </div>
    </div>
  );
}
