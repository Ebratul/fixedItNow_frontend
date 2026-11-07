"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";

/**
 * The windowing shared by VirtualDataTable and the virtualized audit list (TanStack Virtual). The caller renders
 * `items` between two spacer elements of `before` and `after` px, inside the element that gets `scrollRef`
 * (which must scroll: give it a max height and `overflow: auto`).
 *
 * - `paddingStart`: px of content above the first row inside the scroll element (a sticky table header).
 * - `resetOn`: when this value changes (a new result), the scroll element returns to the top.
 * - Row heights are measured after render (`measureElement` on each row with `data-index`), so rows can grow, for
 *   example when an audit entry is opened.
 */
export function useVirtualRows({
  count,
  getKey,
  overscan = 10,
  estimateSize = 64,
  paddingStart = 0,
  resetOn,
}: {
  count: number;
  getKey: (index: number) => string;
  overscan?: number;
  estimateSize?: number;
  paddingStart?: number;
  resetOn?: unknown;
}) {
  // TanStack Virtual returns a stable instance whose methods give new results on every scroll. The React Compiler
  // would memoize those calls on the instance's identity and return stale rows, so this hook opts out.
  "use no memo";
  const scrollRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library -- handled: this hook is "use no memo" (above)
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
    paddingStart,
    getItemKey: getKey,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [resetOn]);

  const items = virtualizer.getVirtualItems();
  const before = items.length > 0 ? items[0]!.start - paddingStart : 0;
  const after = items.length > 0 ? virtualizer.getTotalSize() - items[items.length - 1]!.end : 0;
  return { scrollRef, items, before, after, measureElement: virtualizer.measureElement };
}
