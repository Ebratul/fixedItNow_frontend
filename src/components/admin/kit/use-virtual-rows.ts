"use client";

import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, type FocusEvent } from "react";

/**
 * The windowing shared by VirtualDataTable and the virtualized audit list (TanStack Virtual). The caller renders
 * `items` between two spacer elements of `before` and `after` px, inside the element that gets `scrollRef`
 * (which must scroll: give it a max height and `overflow: auto`).
 *
 * - `paddingStart`: px of content above the first row inside the scroll element (a sticky table header).
 * - `resetOn`: when this value changes (a new result), the scroll element returns to the top.
 * - Row heights are measured after render (`measureElement` on each row with `data-index`), so rows can grow, for
 *   example when an audit entry is opened.
 * - **Scroll-linked UI** (`view`): whether the area is scrolled (header shadow) and which rows are visible
 *   ("Rows 41–60 of 1,507").
 *   - The scroll position is kept in a ref (`scrollTopRef`), never in state.
 *   - Scroll events only request one animation frame; the frame reads the position once and updates `view` only
 *     when a value actually changes. So a fast scroll that fires dozens of events per frame costs one read per
 *     frame, and React re-renders for this UI only when the visible range moves.
 * - **Keyboard focus** (`onFocus`, put it on the scroll element): the keyboard-focused (`:focus-visible`) row index
 *   is kept in state. React
 *   renders focus events synchronously, and the window always reaches `overscan` rows past the focused row. So
 *   when Tab moves focus down faster than scroll events arrive (one per frame), the next rows already exist and
 *   focus never falls out of the table. This only applies while the focused row is near the window; a row
 *   scrolled far away by mouse is not kept mounted.
 */
export type VirtualView = { scrolled: boolean; first: number; last: number };
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
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    // Keyboard focus only. A mouse click also focuses its link, and growing the window between mousedown and
    // mouseup could shift the row under the pointer and lose the click.
    const row = target.matches(":focus-visible") ? target.closest<HTMLElement>("[data-index]") : null;
    const index = row ? Number(row.dataset.index) : null;
    setFocusIndex(index !== null && Number.isInteger(index) ? index : null);
  };
  const rangeExtractor = (range: Range) => {
    const base = defaultRangeExtractor(range);
    if (focusIndex === null || base.length === 0) return base;
    const first = base[0]!;
    const last = base[base.length - 1]!;
    // Only a focused row at (or just past) the edge of the window extends it, and the range stays contiguous.
    if (focusIndex < first - overscan || focusIndex > last + overscan) return base;
    const start = Math.max(0, Math.min(first, focusIndex - overscan));
    const end = Math.min(count - 1, Math.max(last, focusIndex + overscan));
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  // eslint-disable-next-line react-hooks/incompatible-library -- handled: this hook is "use no memo" (above)
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
    paddingStart,
    getItemKey: getKey,
    rangeExtractor,
    // By default every scroll event forces a synchronous React commit (flushSync). Without it, React batches the
    // updates of events that fire within one frame into one render; overscan (10 rows) covers the frame of delay.
    useFlushSync: false,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [resetOn]);

  const scrollTopRef = useRef(0);
  const [view, setView] = useState<VirtualView>({ scrolled: false, first: 0, last: 0 });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = el.scrollTop;
      scrollTopRef.current = top;
      const viewTop = top + paddingStart;
      const viewBottom = top + el.clientHeight;
      const rendered = virtualizer.getVirtualItems();
      const visible = rendered.filter((item) => item.end > viewTop && item.start < viewBottom);
      const next = { scrolled: top > 0, first: visible[0]?.index ?? 0, last: visible.at(-1)?.index ?? 0 };
      setView((prev) => (prev.scrolled === next.scrolled && prev.first === next.first && prev.last === next.last ? prev : next));
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    // First reading once the rows have been laid out (and again for every new result).
    frame = requestAnimationFrame(measure);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [virtualizer, paddingStart, count, resetOn]);

  const items = virtualizer.getVirtualItems();
  const before = items.length > 0 ? items[0]!.start - paddingStart : 0;
  const after = items.length > 0 ? virtualizer.getTotalSize() - items[items.length - 1]!.end : 0;
  return { scrollRef, scrollTopRef, view, onFocus, items, before, after, measureElement: virtualizer.measureElement };
}
