import { motion } from "framer-motion";
import { ExternalLink, FileSearch, X } from "lucide-react";

import { AGENT_LABEL, type ClaimPayload, type SourcePayload } from "@/lib/executionEvents";
import { formatDate, safeHref } from "@/lib/format";
import {
  CLAIM_TYPE_LABEL,
  SOURCE_TYPE_CLASS,
  SOURCE_TYPE_LABEL,
  VERIFICATION_CLASS,
  VERIFICATION_DOT,
  VERIFICATION_LABEL,
} from "@/lib/labels";

/** [1][2] chips after a sentence; each opens its source card. */
export function CitationChips({
  ids,
  numbers,
  activeId,
  onSelect,
}: {
  ids: string[];
  numbers: Record<string, number>;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (ids.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1 align-baseline ml-1">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          aria-label={`Open source ${numbers[id]}`}
          className={`px-1.5 rounded font-label-code-sm text-[11px] leading-5 border transition-colors ${
            id === activeId
              ? "bg-primary-container text-on-primary-container border-primary-container"
              : "bg-surface-container text-primary border-outline-variant/40 hover:border-primary/60"
          }`}
        >
          {numbers[id] ?? "?"}
        </button>
      ))}
    </span>
  );
}

/** The source behind a citation: type, date, link, evidence excerpt, and how the findings citing it were verified. */
export function CitationCard({
  source,
  number,
  claims,
  onClose,
}: {
  source: SourcePayload;
  number: number;
  claims: ClaimPayload[];
  onClose: () => void;
}) {
  const citing = claims.filter((c) => c.source_ids.includes(source.id));
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border border-primary/40 bg-surface-container-low p-4 flex flex-col gap-3"
      role="region"
      aria-label={`Source ${number}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-tag-caps text-tag-caps uppercase text-outline">
          <FileSearch size={14} className="text-primary" /> Citation [{number}] · Source record
        </span>
        <button type="button" onClick={onClose} aria-label="Close source" className="text-outline hover:text-on-surface">
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="font-headline-sm text-headline-sm text-on-surface">{source.title}</span>
        <div className="flex flex-wrap items-center gap-2 font-label-code-sm text-[11px] text-outline">
          <span className={`px-1.5 py-0.5 rounded border ${SOURCE_TYPE_CLASS[source.source_type]}`}>{SOURCE_TYPE_LABEL[source.source_type]}</span>
          <span>{source.published_date ? `Published ${formatDate(source.published_date)}` : "Date unknown"}</span>
          <span>· Retrieved by {AGENT_LABEL[source.retrieved_by] ?? source.retrieved_by}</span>
        </div>
      </div>
      {source.snippet && (
        <blockquote className="border-l-2 border-outline-variant/50 pl-3 font-label-code-sm text-label-code-sm text-on-surface-variant italic">
          “{source.snippet}”
        </blockquote>
      )}
      {safeHref(source.url) ? (
        <a
          href={safeHref(source.url)!}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 font-label-code-sm text-label-code-sm text-primary hover:underline break-all"
        >
          <ExternalLink size={13} className="shrink-0" /> {source.url}
        </a>
      ) : (
        <span className="font-label-code-sm text-label-code-sm text-outline">No link (sample data)</span>
      )}
      <div className="pt-2 border-t border-outline-variant/20 flex flex-col gap-1.5">
        <span className="font-tag-caps text-tag-caps uppercase text-outline">
          {citing.length ? `Findings that cite this source (${citing.length})` : "No extracted findings cite this source"}
        </span>
        {citing.map((c) => (
          <div key={c.id} className="flex items-start justify-between gap-3 font-body-sm text-body-sm">
            <span className="text-on-surface-variant">
              <span className="text-outline">{CLAIM_TYPE_LABEL[c.claim_type]}:</span> {c.text}
            </span>
            <span className={`flex items-center gap-1 shrink-0 font-label-code-sm text-[10px] font-semibold uppercase ${VERIFICATION_CLASS[c.verification]}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${VERIFICATION_DOT[c.verification]}`} />
              {VERIFICATION_LABEL[c.verification]}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
