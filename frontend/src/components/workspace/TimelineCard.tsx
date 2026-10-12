import { Clock } from "lucide-react";

import type { TimelineEntry } from "@/lib/executionEvents";
import { formatDate } from "@/lib/format";

interface TimelineCardProps {
  events: TimelineEntry[];
  citationNumber: Record<string, number>;
  onSelectSource: (id: string) => void;
}

export default function TimelineCard({ events, citationNumber, onSelectSource }: TimelineCardProps) {
  return (
    <article className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-3">
      <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">
        <Clock size={18} className="text-secondary" />
        Case timeline
      </h3>
      <ol className="relative pl-6 flex flex-col gap-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-outline-variant/40">
        {events.map((e) => (
          <li key={`${e.date}-${e.label}`} className="relative flex flex-col">
            <span className="absolute -left-[1.3rem] top-1 w-2.5 h-2.5 rounded-full bg-secondary border-2 border-surface" />
            <span className="font-label-code-sm text-[11px] text-secondary font-medium">{formatDate(e.date)}</span>
            <span className="font-body-md text-body-sm text-on-surface font-medium">{e.label}</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">{e.description}</span>
            <span className="flex flex-wrap gap-1 mt-1">
              {e.source_ids.map((sid) => (
                <button
                  key={sid}
                  type="button"
                  onClick={() => onSelectSource(sid)}
                  className="font-label-code-sm text-[10px] text-outline hover:text-primary transition-colors"
                >
                  [{citationNumber[sid] ?? "?"}]
                </button>
              ))}
            </span>
          </li>
        ))}
      </ol>
    </article>
  );
}
