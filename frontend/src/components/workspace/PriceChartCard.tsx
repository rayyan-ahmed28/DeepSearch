import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";

import type { CalculationPayload, ChartPayload, TimelineEntry } from "@/lib/executionEvents";
import { formatCalculation, formatDate, formatShortDate } from "@/lib/format";

const AXIS_TICK = { fill: "#918fa1", fontSize: 10, fontFamily: "IBM Plex Mono" };

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

interface PriceChartCardProps {
  chart: ChartPayload;
  markers: TimelineEntry[];
  calculations: CalculationPayload[];
  caption: string;
}

/** A line ChartSpec (records of {date, close}) with timeline events marked, and the figures computed from it. */
export default function PriceChartCard({ chart, markers, calculations, caption }: PriceChartCardProps) {
  const dates = new Set(chart.data.map((d) => String(d.date)));
  const visibleMarkers = markers.filter((m) => dates.has(m.date));

  return (
    <article className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border font-label-code-sm text-[11px] font-medium bg-tertiary/10 text-tertiary border-tertiary/30">
          <LineChartIcon size={12} /> Market data
        </span>
        <span className="font-label-code-sm text-[11px] text-outline">Chart data prepared in code (pandas → Recharts)</span>
      </div>
      <h3 className="font-headline-sm text-headline-sm text-on-surface">{chart.title}</h3>

      <div className="w-full h-56 bg-surface-container-lowest rounded-lg border border-outline-variant/20 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart.data} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#464555" strokeOpacity={0.3} vertical={false} />
            <XAxis dataKey="date" tick={AXIS_TICK} tickFormatter={formatShortDate} minTickGap={28} stroke="#464555" />
            <YAxis domain={["auto", "auto"]} tick={AXIS_TICK} width={36} stroke="#464555" />
            <Tooltip
              contentStyle={{ background: "#1e1f25", border: "1px solid #464555", borderRadius: 8, fontFamily: "IBM Plex Mono", fontSize: 11 }}
              labelStyle={{ color: "#c7c4d8" }}
              itemStyle={{ color: "#6bd8cb" }}
              labelFormatter={(v) => formatDate(String(v))}
            />
            {visibleMarkers.map((m) => (
              <ReferenceLine
                key={m.date}
                x={m.date}
                stroke="#7bd0ff"
                strokeDasharray="4 4"
                label={{ value: m.label, fill: "#7bd0ff", fontSize: 10, position: "insideTopLeft" }}
              />
            ))}
            <Line
              type="monotone"
              dataKey="close"
              name="Close"
              stroke="#6bd8cb"
              strokeWidth={2}
              dot={false}
              isAnimationActive={!prefersReducedMotion()}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {calculations.length > 0 && (
        <div className="flex flex-col divide-y divide-outline-variant/20 rounded-lg border border-outline-variant/20">
          {calculations.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="font-body-sm text-body-sm text-on-surface-variant">{c.description}</span>
              <span className="flex flex-col items-end shrink-0">
                <span className="font-label-code-md text-label-code-md text-on-surface">{formatCalculation(c.result, c.unit)}</span>
                <span className="font-label-code-sm text-[10px] text-outline">{c.method}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="font-body-sm text-body-sm text-outline">{caption}</p>
    </article>
  );
}
