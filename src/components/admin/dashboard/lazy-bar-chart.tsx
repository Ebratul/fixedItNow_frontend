"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder with the chart's exact box: the same card padding and border, the 20 px caption line (`text-sm`), the
 * 160 px plot area (`h-40`, the SVG's height) and the 16 px "Show as table" line (`text-xs`): 250 px in all. Swapping it for the chart moves nothing (no layout
 * shift).
 */
export function BarChartSkeleton({ title }: { title: string }) {
  return (
    <figure aria-busy="true" aria-label={`${title}: loading`} className="rounded-card border border-line bg-canvas p-4 shadow-card">
      <div className="flex h-5 items-center justify-between gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="mt-3 h-40 w-full" />
      <div className="mt-2 flex h-4 items-center">
        <Skeleton className="h-3 w-24" />
      </div>
    </figure>
  );
}

/**
 * The dashboard bar chart, loaded as its own chunk on first use (`next/dynamic` must be called from a Client
 * Component for the split to happen). The first load shows BarChartSkeleton.
 */
export const LazyBarChart = dynamic(() => import("./bar-chart").then((m) => m.BarChart), {
  loading: () => <BarChartSkeleton title="Chart" />,
});
