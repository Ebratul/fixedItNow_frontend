"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { type Column, hideCell, renderCells } from "./data-table";

/** Tailwind's md / lg breakpoints, the same ones `hideBelow` uses in DataTable. */
const BREAKPOINTS = { md: "(min-width: 48rem)", lg: "(min-width: 64rem)" } as const;

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * DataTable for long result sets (hundreds to thousands of rows). It renders only the rows inside its scroll area,
 * plus `overscan` rows above and below, with TanStack Virtual.
 *
 * - **Still a real `<table>`:** the caption, `scope` headers and the row header cell are the same as in DataTable.
 *   Rows that are not rendered are replaced by one spacer row above and one below, so column alignment and the
 *   row dividers stay native.
 * - **`table-layout: fixed`:** the column widths do not jump as different rows scroll in. A column with a `width`
 *   keeps it, and columns without one share the rest. Give at least one column no width, or the table cannot
 *   fill its width.
 * - **`hideBelow` columns are left out of the DOM below their breakpoint,** not hidden with CSS. In a fixed-layout
 *   table, Chrome keeps the width of a `display: none` cell, which leaves an empty band beside the header.
 * - **The header row is sticky inside the scroll area.** The area also scrolls sideways on narrow screens, as
 *   DataTable does.
 * - **Screen readers:** `aria-rowcount` and `aria-rowindex` give the full row count and each row's real position.
 * - **Keyboard:** Tab moves through the links in the rows. The next row is always rendered (overscan), and the
 *   browser scrolls the focused link into view, which renders the rows after it. The scroll area itself is
 *   focusable, so arrow keys, Page Up/Down and Home/End scroll it.
 * - **Row heights:** each row's height is measured after render, so wrapped emails and badges are handled.
 */
export function VirtualDataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  busy,
  overscan = 10,
  estimateRowHeight = 64,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  busy?: boolean;
  /** Rows rendered beyond each edge of the visible area. */
  overscan?: number;
  /** First guess of a row's height in px, before it is measured. */
  estimateRowHeight?: number;
}) {
  // TanStack Virtual returns a stable instance whose methods give new results on every scroll. The React Compiler
  // would memoize those calls on the instance's identity and render stale rows, so this component opts out.
  "use no memo";
  const scrollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLTableSectionElement>(null);
  const [headHeight, setHeadHeight] = useState(0);
  const md = useMedia(BREAKPOINTS.md);
  const lg = useMedia(BREAKPOINTS.lg);
  const shown = columns.filter((c) => (c.hideBelow === "md" ? md : c.hideBelow === "lg" ? lg : true));

  // The header row sits above the body inside the scroll area: body row offsets start below it.
  useLayoutEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const update = () => setHeadHeight(head.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(head);
    return () => observer.disconnect();
  }, []);

  // eslint-disable-next-line react-hooks/incompatible-library -- handled: this component is "use no memo" (above)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan,
    paddingStart: headHeight,
    // Keeps a row's measured height attached to that row when the result changes.
    getItemKey: (index) => rowKey(rows[index]!),
  });

  // A new result (another filter or page size) starts at its first row.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [rows]);

  const items = virtualizer.getVirtualItems();
  const before = items.length > 0 ? items[0]!.start - headHeight : 0;
  const after = items.length > 0 ? virtualizer.getTotalSize() - items[items.length - 1]!.end : 0;
  const spacer = (height: number) => (
    <tr aria-hidden="true">
      <td colSpan={shown.length} style={{ height, padding: 0 }} />
    </tr>
  );

  return (
    <div
      ref={scrollRef}
      role="region"
      aria-label={`${caption}, ${rows.length} rows (scrollable)`}
      tabIndex={0}
      // scroll-padding keeps a focused row from scrolling under the sticky header.
      style={{ scrollPaddingTop: headHeight }}
      className={cn("max-h-[70vh] overflow-auto rounded-card border border-line bg-canvas shadow-card", busy && "opacity-60 transition-opacity")}
      aria-busy={busy || undefined}
    >
      <table className="w-full min-w-[34rem] table-fixed border-collapse text-left text-sm" aria-rowcount={rows.length + 1}>
        <caption className="sr-only">{caption}</caption>
        <thead ref={headRef} className="text-xs tracking-wide text-ink-subtle uppercase">
          <tr aria-rowindex={1}>
            {shown.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={c.width ? { width: c.width } : undefined}
                className={cn(
                  "sticky top-0 z-10 bg-surface px-4 py-3 font-bold shadow-[inset_0_-1px_0_var(--color-line)]",
                  c.align === "right" && "text-right",
                  hideCell(c.hideBelow),
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {before > 0 && spacer(before)}
          {items.map((item) => (
            <tr key={item.key} data-index={item.index} ref={virtualizer.measureElement} aria-rowindex={item.index + 2} className="align-top hover:bg-brand-50/40">
              {renderCells(rows[item.index]!, shown)}
            </tr>
          ))}
          {after > 0 && spacer(after)}
        </tbody>
      </table>
    </div>
  );
}
