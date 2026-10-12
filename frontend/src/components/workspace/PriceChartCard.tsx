import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";

import type { ChartPayload, TimelineEntry } from "@/lib/executionEvents";
import { formatDate, formatShortDate } from "@/lib/format";

const AXIS_TICK = { fill: "#918fa1", fontSize: 10, fontFamily: "IBM Plex Mono" };

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** A line ChartSpec (records of {date, close}), with timeline events marked on trading days. */
export default function PriceChartCard({ chart, markers }: { chart: ChartPayload; markers: TimelineEntry[] }) {
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
      <p className="font-body-sm text-body-sm text-outline">
        Synthetic sample data for a fictional ticker. Dashed lines mark case events from the timeline.
      </p>
    </article>
  );
}
