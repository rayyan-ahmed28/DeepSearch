import { motion } from "framer-motion";
import { Calculator, Link2 } from "lucide-react";

import type { ClaimPayload, SourcePayload } from "@/lib/executionEvents";
import { formatClaimValue, formatDate } from "@/lib/format";
import {
  CLAIM_TYPE_CLASS,
  CLAIM_TYPE_LABEL,
  CLAIM_TYPE_NOTE,
  VERIFICATION_CLASS,
  VERIFICATION_DOT,
  VERIFICATION_HELP,
  VERIFICATION_LABEL,
  domainChip,
} from "@/lib/labels";

interface FindingCardProps {
  claim: ClaimPayload;
  sourcesById: Record<string, SourcePayload>;
  citationNumber: Record<string, number>;
  selectedSourceId: string | null;
  onSelectSource: (id: string) => void;
}

export default function FindingCard({ claim, sourcesById, citationNumber, selectedSourceId, onSelectSource }: FindingCardProps) {
  const domain = domainChip(claim.domain);
  const note = CLAIM_TYPE_NOTE[claim.claim_type];
  const highlighted = selectedSourceId !== null && claim.source_ids.includes(selectedSourceId);

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`p-4 rounded-xl bg-surface-container-low border transition-colors flex flex-col gap-3 ${
        highlighted ? "border-primary/60" : "border-outline-variant/30 hover:border-outline-variant/70"
      }`}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded border font-label-code-sm text-[11px] font-medium ${CLAIM_TYPE_CLASS[claim.claim_type]}`}>
            {CLAIM_TYPE_LABEL[claim.claim_type]}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded border font-label-code-sm text-[11px] uppercase ${domain.className}`}>
            {domain.label}
          </span>
        </div>
        <span
          title={VERIFICATION_HELP[claim.verification]}
          className={`flex items-center gap-1.5 font-label-code-sm text-[11px] font-semibold uppercase cursor-help ${VERIFICATION_CLASS[claim.verification]}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${VERIFICATION_DOT[claim.verification]}`} />
          {VERIFICATION_LABEL[claim.verification]}
        </span>
      </div>

      <p className="font-body-md text-body-md text-on-surface leading-relaxed">{claim.text}</p>
      {note && <p className="font-body-sm text-body-sm text-outline -mt-1">{note}</p>}

      {claim.value != null && (
        <div className="p-2.5 rounded-lg bg-surface-container border-l-2 border-primary-container flex items-center gap-2">
          <Calculator size={14} className="text-primary shrink-0" />
          <span className="font-label-code-sm text-label-code-sm text-on-surface">{formatClaimValue(claim.value, claim.unit, claim.calculation_id)}</span>
          <span className="font-body-sm text-body-sm text-outline">
            {claim.unit === "%" ? "computed in code from the price series" : "as reported in the cited source"}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 flex-wrap gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {claim.source_ids.length === 0 && (
            <span className="font-label-code-sm text-[11px] text-outline">No supporting source</span>
          )}
          {claim.source_ids.map((sid) => {
            const source = sourcesById[sid];
            const active = sid === selectedSourceId;
            return (
              <button
                key={sid}
                type="button"
                onClick={() => onSelectSource(sid)}
                title={source?.title}
                className={`flex items-center gap-1 px-2 py-1 rounded border font-label-code-sm text-[11px] transition-colors max-w-[16rem] ${
                  active
                    ? "bg-primary-container text-on-primary-container border-primary-container"
                    : "bg-surface-container hover:bg-surface-container-high text-on-surface-variant border-outline-variant/30"
                }`}
              >
                <Link2 size={12} className="shrink-0" />
                <span className="truncate">
                  [{citationNumber[sid] ?? "?"}] {source?.title ?? "Source pending"}
                </span>
              </button>
            );
          })}
        </div>
        {claim.event_date && (
          <span className="font-label-code-sm text-[11px] text-outline">{formatDate(claim.event_date)}</span>
        )}
      </div>
    </motion.article>
  );
}
