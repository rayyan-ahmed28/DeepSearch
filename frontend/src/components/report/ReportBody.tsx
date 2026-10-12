import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";

import FindingCard from "@/components/workspace/FindingCard";
import PriceChartCard from "@/components/workspace/PriceChartCard";
import TimelineCard from "@/components/workspace/TimelineCard";
import { CitationCard, CitationChips } from "@/components/report/CitationCard";
import { formatCalculation, formatDate } from "@/lib/format";
import { SOURCE_TYPE_LABEL } from "@/lib/labels";
import { citationNumbers, type Report, type ReportBlock } from "@/lib/report";

interface OpenCitation {
  blockKey: string;
  sourceId: string;
}

/** Renders every section and block of a report, with inline source cards for citations. */
export default function ReportBody({ report, chartCaption }: { report: Report; chartCaption: string }) {
  const numbers = useMemo(() => citationNumbers(report), [report]);
  const sources = useMemo(() => Object.fromEntries(report.sources.map((s) => [s.id, s])), [report]);
  const claims = useMemo(() => Object.fromEntries(report.claims.map((c) => [c.id, c])), [report]);
  const calcs = useMemo(() => Object.fromEntries(report.calculations.map((c) => [c.id, c])), [report]);
  const charts = useMemo(() => Object.fromEntries(report.charts.map((c) => [c.id, c])), [report]);
  // Key figures: the ones the narrative actually cites, in the order it cites them.
  const keyFigures = useMemo(() => {
    const cited = [...new Set(report.audit.figures_filled)].map((id) => calcs[id]).filter(Boolean);
    return (cited.length ? cited : report.calculations).slice(0, 3);
  }, [report, calcs]);
  const [open, setOpen] = useState<OpenCitation | null>(null);

  const toggle = (blockKey: string, sourceId: string) =>
    setOpen((cur) => (cur && cur.blockKey === blockKey && cur.sourceId === sourceId ? null : { blockKey, sourceId }));
  const activeIn = (blockKey: string) => (open?.blockKey === blockKey ? open.sourceId : null);

  function card(blockKey: string) {
    if (open?.blockKey !== blockKey || !sources[open.sourceId]) return null;
    return (
      <CitationCard
        source={sources[open.sourceId]}
        number={numbers[open.sourceId]}
        claims={report.claims}
        onClose={() => setOpen(null)}
      />
    );
  }

  function renderBlock(block: ReportBlock, key: string) {
    switch (block.type) {
      case "paragraph":
        return (
          <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
            {block.text}
            <CitationChips ids={block.citations} numbers={numbers} activeId={activeIn(key)} onSelect={(id) => toggle(key, id)} />
          </p>
        );
      case "bullets":
        return (
          <ul className="list-disc pl-5 flex flex-col gap-1.5 font-body-md text-body-md text-on-surface-variant">
            {block.items.map((item, i) => (
              <li key={i}>
                {item.text}
                <CitationChips ids={item.citations} numbers={numbers} activeId={activeIn(key)} onSelect={(id) => toggle(key, id)} />
              </li>
            ))}
          </ul>
        );
      case "finding": {
        const claim = claims[block.claim_id];
        if (!claim) return null;
        return (
          <FindingCard
            claim={claim}
            sourcesById={sources}
            citationNumber={numbers}
            selectedSourceId={activeIn(key)}
            onSelectSource={(id) => toggle(key, id)}
          />
        );
      }
      case "chart": {
        const chart = charts[block.chart_id];
        if (!chart) return null;
        return <PriceChartCard chart={chart} markers={report.timeline} calculations={[]} caption={chartCaption} />;
      }
      case "calculations":
        return (
          <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
            <table className="w-full text-left">
              <thead className="bg-surface-container font-tag-caps text-tag-caps uppercase text-outline">
                <tr>
                  <th className="px-4 py-2 font-normal">Figure</th>
                  <th className="px-4 py-2 font-normal text-right">Value</th>
                  <th className="px-4 py-2 font-normal">Method (computed in code)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {block.calculation_ids.map((id) =>
                  calcs[id] ? (
                    <tr key={id}>
                      <td className="px-4 py-2 font-body-sm text-body-sm text-on-surface-variant">{calcs[id].description}</td>
                      <td className="px-4 py-2 font-label-code-md text-label-code-md text-on-surface text-right tabular-nums">
                        {formatCalculation(calcs[id].result, calcs[id].unit)}
                      </td>
                      <td className="px-4 py-2 font-label-code-sm text-label-code-sm text-outline">{calcs[id].method}</td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
          </div>
        );
      case "timeline":
        return <TimelineCard events={report.timeline} citationNumber={numbers} onSelectSource={(id) => toggle(key, id)} />;
      case "sources":
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {report.sources.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(key, s.id)}
                className={`text-left p-3 rounded-lg border transition-colors flex flex-col gap-1 ${
                  activeIn(key) === s.id ? "border-primary/60 bg-surface-container" : "border-outline-variant/30 bg-surface-container-low hover:border-outline-variant/70"
                }`}
              >
                <span className="font-label-code-sm text-label-code-sm text-primary">[{numbers[s.id]}]</span>
                <span className="font-body-sm text-body-sm text-on-surface font-medium leading-snug">{s.title}</span>
                <span className="font-label-code-sm text-[11px] text-outline">
                  {SOURCE_TYPE_LABEL[s.source_type]} · {s.published_date ? formatDate(s.published_date) : "date unknown"}
                </span>
              </button>
            ))}
          </div>
        );
      case "callout":
        return (
          <div
            className={`flex items-start gap-3 p-4 rounded-xl bg-surface-container-low border-l-2 ${
              block.tone === "warning" ? "border-[#f5b942]" : "border-primary-container"
            }`}
          >
            {block.tone === "warning" ? (
              <AlertTriangle size={18} className="text-[#f5b942] shrink-0 mt-0.5" />
            ) : (
              <Info size={18} className="text-primary shrink-0 mt-0.5" />
            )}
            <p className="font-body-md text-body-md text-on-surface-variant">{block.text}</p>
          </div>
        );
    }
  }

  return (
    <div className="flex flex-col gap-12">
      {report.sections.map((section, i) => (
        <section key={section.id} id={`section-${section.id}`} className="scroll-mt-24 flex flex-col gap-4">
          <h2 className="flex items-baseline gap-3 font-headline-md text-headline-md text-on-surface">
            <span className="font-label-code-md text-label-code-md text-primary">{String(i + 1).padStart(2, "0")} //</span>
            {section.heading}
          </h2>
          {section.blocks.map((block, j) => {
            const key = `${section.id}-${j}`;
            return (
              <Fragment key={key}>
                {renderBlock(block, key)}
                {card(key)}
              </Fragment>
            );
          })}
          {section.kind === "executive_summary" && keyFigures.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {keyFigures.map((c) => (
                <div key={c.id} className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-1">
                  <span className="font-tag-caps text-tag-caps uppercase text-outline">Key figure</span>
                  <span className="font-headline-md text-headline-md text-on-surface tabular-nums">{formatCalculation(c.result, c.unit)}</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">{c.description}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
