import { useEffect } from "react";
import { ExternalLink, Library } from "lucide-react";

import { AGENT_LABEL, type SourcePayload } from "@/lib/executionEvents";
import { formatDate } from "@/lib/format";
import { SOURCE_FILTERS, SOURCE_TYPE_CLASS, SOURCE_TYPE_LABEL, type SourceFilter } from "@/lib/labels";

interface SourceListProps {
  sources: SourcePayload[];
  citationNumber: Record<string, number>;
  citedBy: Record<string, number>;
  filter: SourceFilter;
  onFilter: (f: SourceFilter) => void;
  selectedSourceId: string | null;
  onSelectSource: (id: string) => void;
}

export default function SourceList({
  sources,
  citationNumber,
  citedBy,
  filter,
  onFilter,
  selectedSourceId,
  onSelectSource,
}: SourceListProps) {
  const types = SOURCE_FILTERS.find((f) => f.id === filter)!.types;
  const visible = sources.filter((s) => types.includes(s.source_type));
  const citedCount = sources.filter((s) => (citedBy[s.id] ?? 0) > 0).length;

  // Bring the selected source into view when it was picked from a finding.
  useEffect(() => {
    if (selectedSourceId) document.getElementById(`source-${selectedSourceId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedSourceId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
        <div className="flex items-center gap-2">
          <span className="font-tag-caps text-tag-caps uppercase text-outline">Sources</span>
          <span className="px-1.5 rounded bg-surface-container-high text-tertiary font-label-code-sm text-[10px]">
            {citedCount} / {sources.length} CITED
          </span>
        </div>
        <Library size={16} className="text-outline" />
      </div>

      <div className="grid grid-cols-4 gap-1 p-0.5 rounded bg-surface-container-low font-label-code-sm text-[10px] uppercase">
        {SOURCE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilter(f.id)}
            className={`py-1 rounded text-center transition-colors ${
              filter === f.id ? "bg-surface-container-high text-on-surface font-semibold" : "text-outline hover:text-on-surface"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {sources.length === 0 && <p className="font-body-sm text-body-sm text-outline">No sources yet.</p>}
        {sources.length > 0 && visible.length === 0 && (
          <p className="font-body-sm text-body-sm text-outline">No sources of this type.</p>
        )}
        {visible.map((s) => {
          const active = s.id === selectedSourceId;
          return (
            <button
              id={`source-${s.id}`}
              key={s.id}
              type="button"
              onClick={() => onSelectSource(s.id)}
              className={`text-left p-2.5 rounded-lg border flex flex-col gap-1.5 transition-colors ${
                active
                  ? "bg-surface-container border-primary/60"
                  : "bg-surface-container-low border-outline-variant/30 hover:border-outline-variant/70"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`px-1.5 py-0.5 rounded border font-label-code-sm text-[10px] ${SOURCE_TYPE_CLASS[s.source_type]}`}>
                  {SOURCE_TYPE_LABEL[s.source_type]}
                </span>
                <span className="font-label-code-sm text-[10px] text-outline">
                  [{citationNumber[s.id]}] · cited {citedBy[s.id] ?? 0}×
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-on-surface font-medium leading-snug">{s.title}</span>
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 font-label-code-sm text-[11px] text-primary truncate hover:underline"
                >
                  <ExternalLink size={11} className="shrink-0" />
                  <span className="truncate">{s.url.replace(/^https?:\/\//, "")}</span>
                </a>
              ) : (
                <span className="font-label-code-sm text-[11px] text-outline">No link (sample data)</span>
              )}
              {active && s.snippet && (
                <p className="font-body-sm text-body-sm text-on-surface-variant border-l-2 border-outline-variant/40 pl-2">
                  “{s.snippet}”
                </p>
              )}
              <div className="flex items-center justify-between pt-1 border-t border-outline-variant/10 font-label-code-sm text-[10px] text-outline">
                <span>{s.published_date ? formatDate(s.published_date) : "Date unknown"}</span>
                <span>via {AGENT_LABEL[s.retrieved_by]}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
