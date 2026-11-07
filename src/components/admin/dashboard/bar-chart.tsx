"use client";

import { useId, useState } from "react";
import { formatBdt } from "@/lib/format";

export type Point = { date: string; value: number };
/** How values are written. A name, not a function, so a Server Component can pass it. */
export type ChartUnit = "count" | "bdt";
const FORMAT: Record<ChartUnit, (n: number) => string> = { count: (n) => n.toLocaleString("en-BD"), bdt: formatBdt };

/**
 * One-series daily bar chart as plain SVG. Single series: no legend needed (the title names it).
 * Bars are anchored to the baseline with a 2px gap; hovering a bar shows its value, and a collapsible table
 * gives the same numbers to screen readers and keyboard users (the figure itself is one labelled image).
 * The table is rendered only while it is open: a closed `<details>` would otherwise still render a row per day on
 * every update.
 */
export function BarChart({ title, points, unit = "count" }: { title: string; points: Point[]; unit?: ChartUnit }) {
  const id = useId();
  const format = FORMAT[unit];
  const [active, setActive] = useState<number | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const max = Math.max(1, ...points.map((p) => p.value));
  const width = 600;
  const height = 150;
  const slot = width / Math.max(points.length, 1);
  const bar = Math.max(slot - 2, 1);
  const shown = active !== null ? points[active] : undefined;
  const total = points.reduce((n, p) => n + p.value, 0);

  return (
    <figure aria-labelledby={`${id}-t`} className="rounded-card border border-line bg-canvas p-4 shadow-card">
      <figcaption id={`${id}-t`} className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-ink">{title}</span>
        <span className="text-xs text-ink-muted" aria-live="polite">
          {shown ? `${shown.date}: ${format(shown.value)}` : `Total ${format(total)}`}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height + 18}`} role="img" aria-label={`${title}, ${points.length} days, total ${format(total)}`} className="mt-3 h-40 w-full">
        <line x1="0" x2={width} y1={height} y2={height} className="stroke-line-strong" strokeWidth="1" />
        {points.map((p, i) => {
          const h = p.value === 0 ? 0 : Math.max((p.value / max) * (height - 8), 2);
          return (
            <g key={p.date}>
              {/* wider invisible hit target than the visible bar */}
              <rect
                x={i * slot}
                y={0}
                width={slot}
                height={height}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
              />
              <rect x={i * slot + 1} y={height - h} width={bar} height={h} rx={Math.min(3, bar / 2)} className={active === i ? "fill-brand-500" : "fill-brand-700"} pointerEvents="none" />
            </g>
          );
        })}
        <text x="0" y={height + 14} className="fill-ink-subtle text-[10px]">{points[0]?.date}</text>
        <text x={width} y={height + 14} textAnchor="end" className="fill-ink-subtle text-[10px]">{points.at(-1)?.date}</text>
        <text x={width} y="10" textAnchor="end" className="fill-ink-subtle text-[10px]">max {format(max)}</text>
      </svg>
      <details className="mt-2 text-xs" open={tableOpen} onToggle={(e) => setTableOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer font-semibold text-brand-700">Show as table</summary>
        {tableOpen && <table className="mt-2 w-full text-left">
          <caption className="sr-only">{title}</caption>
          <thead><tr><th scope="col" className="py-1">Date</th><th scope="col" className="py-1 text-right">Value</th></tr></thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date} className="border-t border-line"><th scope="row" className="py-1 font-normal">{p.date}</th><td className="py-1 text-right tabular-nums">{format(p.value)}</td></tr>
            ))}
          </tbody>
        </table>}
      </details>
    </figure>
  );
}
